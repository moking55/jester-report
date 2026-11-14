"""RenderService: the pipeline public-api calls (SPEC-render-service.md)."""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import io
import time
from collections import OrderedDict
from collections.abc import AsyncIterator, Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

from psycopg_pool import AsyncConnectionPool
from pypdf import PdfReader

from ..auth import Principal
from ..binder import Bound
from ..engine_client import EngineClient, EngineError, EngineResult, RenderFile
from ..report_definition import DefinitionInput, load_definition
from ..report_definition.lint import engine_font_candidates
from ..report_definition.loader import ReportDefinition
from ..report_definition.model import parse_report_json
from ..report_definition.problems import Problem
from ..template_store import StoredDefinition, StoreError, TemplateStore
from .fonts import EngineFonts
from .runs import Caller, NewRun, Runs, canonical_sha256
from .worker import WorkerTimeout, run_in_worker


@dataclass(frozen=True)
class RenderSettings:
    bind_timeout_s: float = 10.0
    max_concurrent: int = 6  # per API process; matches Gotenberg's default --chromium-max-concurrency
    queue_wait_s: float = 10.0
    engine_image: str = "jester/gotenberg:9.4.1-th1"
    definition_cache: int = 64
    asset_cache_bytes: int = 64 * 1024 * 1024


@dataclass(frozen=True)
class RenderOutcome:
    pdf: bytes
    run_id: str
    version: int | None  # None for a draft preview
    filename: str
    problems: list[Problem] = field(default_factory=list)  # warnings only


class RenderError(Exception):
    def __init__(
        self,
        code: str,
        http_status: int,
        message: str,
        *,
        retryable: bool = False,
        problems: list[Problem] | None = None,
        run_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code, self.http_status, self.message = code, http_status, message
        self.retryable, self.problems, self.run_id = retryable, problems or [], run_id


# engine-client code -> (contract code, HTTP status, retryable)
_ENGINE_ERRORS: dict[str, tuple[str, int, bool]] = {
    "RENDER_TIMEOUT": ("RENDER_TIMEOUT", 504, True),
    "SERVICE_UNAVAILABLE": ("SERVICE_UNAVAILABLE", 503, True),
    "RENDER_RESOURCE_FAILED": ("RENDER_RESOURCE_FAILED", 502, False),
    "ENGINE_MISCONFIGURED": ("ENGINE_MISCONFIGURED", 502, False),
    "RENDER_INPUT_INVALID": ("RENDER_INPUT_INVALID", 502, False),  # the engine refused what we built: our bug
    "RENDER_FAILED": ("RENDER_FAILED", 502, False),
}


def caller_of(principal: Principal) -> Caller:
    if principal.kind == "user" and principal.user is not None:
        return Caller("user", str(principal.user.id), principal.user.username)
    return Caller("api-key", str(principal.api_key_id), principal.name)


def count_pages(pdf: bytes) -> int | None:
    try:
        return len(PdfReader(io.BytesIO(pdf)).pages)
    except Exception:  # an odd PDF must not fail a render that already succeeded
        return None


class _Lru:
    """Small LRU by entry count and total size (stdlib only)."""

    def __init__(self, max_items: int, max_bytes: int | None = None) -> None:
        self._items: OrderedDict[str, Any] = OrderedDict()
        self._sizes: dict[str, int] = {}
        self._max_items, self._max_bytes = max_items, max_bytes

    def get(self, key: str) -> Any:
        if key in self._items:
            self._items.move_to_end(key)
            return self._items[key]
        return None

    def put(self, key: str, value: Any, size: int = 0) -> None:
        self._items[key], self._sizes[key] = value, size
        self._items.move_to_end(key)
        while len(self._items) > self._max_items or (
            self._max_bytes is not None and sum(self._sizes.values()) > self._max_bytes
        ):
            old, _ = self._items.popitem(last=False)
            del self._sizes[old]


class RenderService:
    def __init__(
        self,
        store: TemplateStore,
        engine: EngineClient,
        db: AsyncConnectionPool,
        settings: RenderSettings | None = None,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._store, self._engine, self._db = store, engine, db
        self._settings = settings or RenderSettings()
        self._now = clock
        self._runs = Runs(db, clock)
        self._fonts = EngineFonts(engine)
        self._slots = asyncio.Semaphore(self._settings.max_concurrent)
        self._definitions = _Lru(self._settings.definition_cache)
        self._assets = _Lru(10_000, self._settings.asset_cache_bytes)
        self._engine_version: str | None = None

    # ---- building blocks -------------------------------------------------------------------------------
    @contextlib.asynccontextmanager
    async def _slot(self) -> AsyncIterator[None]:
        try:
            await asyncio.wait_for(self._slots.acquire(), self._settings.queue_wait_s)
        except TimeoutError:
            raise RenderError(
                "SERVICE_UNAVAILABLE", 503, "too many renders at once; retry shortly", retryable=True
            ) from None
        try:
            yield
        finally:
            self._slots.release()

    async def _resolve(self, template_id: str, ref: Literal["draft", "published"] | int) -> StoredDefinition:
        try:
            return await self._store.definition_input(template_id, ref)
        except StoreError as exc:
            if exc.code == "NOT_FOUND":
                raise RenderError("NOT_FOUND", 404, exc.message) from None
            raise

    async def _definition(self, stored: StoredDefinition) -> tuple[ReportDefinition | None, list[Problem]]:
        """load_definition with the engine's real fonts; published versions are cached by sha256."""
        cacheable = stored.version is not None
        if cacheable and (hit := self._definitions.get(stored.sha256)) is not None:
            return hit
        report, _ = (
            parse_report_json(stored.files["report.json"]) if "report.json" in stored.files else (None, [])
        )
        fonts = await self._fonts.known(engine_font_candidates(stored.files, report))
        result = load_definition(DefinitionInput(stored.files, stored.assets, fonts))
        answer = (result.definition, result.problems)
        if cacheable and result.definition is not None and fonts is not None:  # unverified fonts: ask again
            self._definitions.put(stored.sha256, answer)
        return answer

    async def _asset(self, sha256: str) -> bytes:
        if (hit := self._assets.get(sha256)) is not None:
            return hit
        data = await self._store.asset_bytes(sha256)
        self._assets.put(sha256, data, len(data))
        return data

    async def _engine_version_cached(self) -> str | None:
        if self._engine_version is None:
            with contextlib.suppress(EngineError):
                self._engine_version = (await self._engine.health()).version
        return self._engine_version

    async def _bound(
        self, stored: StoredDefinition, params: Mapping[str, Any], data: Any, meta: Mapping[str, Any]
    ) -> tuple[Bound, list[Problem]]:
        definition, problems = await self._definition(stored)
        if definition is None:
            # a published version that no longer loads, e.g. a font was removed from the engine
            code = "FONT_MISSING" if any(p.code == "FONT_MISSING" for p in problems) else "RENDER_FAILED"
            raise RenderError(code, 502, "the template cannot be used with this engine", problems=problems)
        try:
            result = await run_in_worker(
                definition,
                stored.files,
                stored.assets,
                params,
                data,
                meta,
                timeout_s=self._settings.bind_timeout_s,
            )
        except WorkerTimeout:
            raise RenderError(
                "RENDER_TIMEOUT", 504, "preparing the document took too long", retryable=True
            ) from None
        warnings = [p for p in problems if p.severity == "warning"]
        if result.bound is None:
            if any(p.code == "RENDER_FAILED" for p in result.problems):
                raise RenderError(
                    "RENDER_FAILED", 502, "the document could not be prepared", problems=result.problems
                )
            raise RenderError(
                "INPUT_INVALID", 422, "params or data do not fit the template", problems=result.problems
            )
        return result.bound, [*warnings, *result.problems]

    async def _convert(self, bound: Bound, stored: StoredDefinition, index_html: bytes) -> EngineResult:
        files = [
            *bound.files,
            *[RenderFile(n, await self._asset(stored.assets[n].sha256)) for n in bound.asset_names],
        ]
        try:
            return await self._engine.convert_html(
                index_html,
                page=bound.page,
                header_html=bound.header_html,
                footer_html=bound.footer_html,
                assets=files,
            )
        except EngineError as exc:
            code, status, retryable = _ENGINE_ERRORS.get(exc.code, ("RENDER_FAILED", 502, False))
            raise RenderError(code, status, exc.message, retryable=retryable) from None

    async def _provenance(
        self,
        stored: StoredDefinition,
        params: Any,
        data: Any,
        result: EngineResult | None,
        bound: Bound | None,
    ) -> dict[str, Any]:
        fonts = [
            {"name": name, "sha256": info.sha256}
            for name, info in sorted(stored.assets.items())
            if info.font_family and bound is not None and name in bound.asset_names
        ]
        return {
            "templateSha256": stored.sha256,
            "paramsSha256": canonical_sha256(params),
            "dataSha256": canonical_sha256(data),
            "engineVersion": await self._engine_version_cached(),
            "engineImage": self._settings.engine_image,
            "fonts": fonts,
            "options": result.options if result else {},
            "outputSha256": hashlib.sha256(result.pdf).hexdigest() if result else None,
            "engineTrace": result.trace if result else None,
        }

    # ---- render ----------------------------------------------------------------------------------------
    async def render(
        self,
        template_id: str,
        version: int | Literal["published"],
        params: Mapping[str, Any],
        data: Any,
        caller: Principal,
        request_id: str | None = None,
        filename: str | None = None,
    ) -> RenderOutcome:
        return await self._run(
            "render",
            template_id,
            version,
            dict(params or {}),
            data,
            caller,
            request_id,
            filename,
            watermark=False,
        )

    async def _run(
        self,
        kind: Literal["render", "preview"],
        template_id: str,
        ref: Literal["draft", "published"] | int,
        params: dict[str, Any],
        data: Any,
        caller: Principal,
        request_id: str | None,
        filename: str | None,
        *,
        watermark: bool,
    ) -> RenderOutcome:
        started = time.monotonic()
        stored: StoredDefinition | None = None
        bound: Bound | None = None
        result: EngineResult | None = None
        try:
            async with self._slot():
                stored = await self._resolve(template_id, ref)
                meta = {
                    "templateId": template_id,
                    "version": stored.version,
                    "renderedAt": self._now().isoformat(),
                }
                bound, warnings = await self._bound(stored, params, data, meta)
                index_html = _with_watermark(bound.index_html) if watermark else bound.index_html
                result = await self._convert(bound, stored, index_html)
        except RenderError as exc:
            exc.run_id = await self._record(
                kind, template_id, stored, caller, request_id, started, params, data, None, bound, exc
            )
            raise
        run_id = await self._record(
            kind,
            template_id,
            stored,
            caller,
            request_id,
            started,
            params,
            data,
            result,
            bound,
            None,
            warnings,
        )
        default_name = (
            f"{template_id}-v{stored.version}.pdf"
            if stored.version
            else f"{template_id}-draft-r{stored.revision}.pdf"
        )
        return RenderOutcome(result.pdf, run_id, stored.version, filename or default_name, warnings)

    async def _record(
        self,
        kind: Literal["render", "preview"],
        template_id: str,
        stored: StoredDefinition | None,
        caller: Principal,
        request_id: str | None,
        started: float,
        params: Any,
        data: Any,
        result: EngineResult | None,
        bound: Bound | None,
        failure: RenderError | None,
        warnings: list[Problem] | None = None,
    ) -> str:
        provenance = await self._provenance(stored, params, data, result, bound) if stored else {}
        return await self._runs.record(
            NewRun(
                kind=kind,
                template_id=template_id,
                caller=caller_of(caller),
                status="failed" if failure else "succeeded",
                version=stored.version if stored else None,
                draft_revision=stored.revision if stored else None,
                request_id=request_id,
                error_code=failure.code if failure else None,
                pages=count_pages(result.pdf) if result else None,
                duration_ms=int((time.monotonic() - started) * 1000),
                provenance=provenance,
                problems=failure.problems if failure else (warnings or []),
            )
        )


_WATERMARK = (
    '<div aria-hidden="true" style="position: fixed; top: 40%; left: 0; width: 100%; text-align: center; '
    "font-size: 96pt; color: rgba(200, 0, 0, 0.15); transform: rotate(-30deg); pointer-events: none; "
    'z-index: 9999;">DRAFT</div>'
)


def _with_watermark(index_html: bytes) -> bytes:
    """Chromium prints position: fixed elements on every page; the user's template is not touched."""
    text = index_html.decode("utf-8")
    cut = text.rfind("</body>")
    return (text[:cut] + _WATERMARK + text[cut:] if cut != -1 else text + _WATERMARK).encode("utf-8")
