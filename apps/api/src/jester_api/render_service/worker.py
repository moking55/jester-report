"""prepare + bind in a process that can be killed (SPEC-render-service.md assumption 2).

A template can loop for ever (nested range() loops write no output, so binder's size limit never trips),
and asyncio cannot stop CPU work. So every job runs in its own process and is killed at the timeout.

shortcut: one new process per job costs ~10-50 ms on Linux (forkserver) and ~1 s on Windows (spawn, dev only).
When throughput matters more, switch `_run_blocking` to a process pool (e.g. concurrent.futures with
max_tasks_per_child, or a pool that is rebuilt when a worker is killed); `run_in_worker` keeps its
signature, so the service does not change.
"""

from __future__ import annotations

import asyncio
import functools
import multiprocessing
import sys
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from ..binder import Bound, bind
from ..data_prep import prepare
from ..report_definition.loader import ReportDefinition
from ..report_definition.problems import AssetInfo, Problem, error


@dataclass(frozen=True)
class PrepareOnly:
    view: dict[str, Any] | None  # Prepared.view_model(); None when any problem is an error
    problems: list[Problem]


@dataclass(frozen=True)
class WorkerResult:
    bound: Bound | None  # None when any problem is an error
    problems: list[Problem]  # prepare problems first, then bind problems


class WorkerTimeout(Exception):
    pass


def _job(
    definition: ReportDefinition,
    files: Mapping[str, str],
    assets: Mapping[str, AssetInfo],
    params: Mapping[str, Any],
    data: Any,
    meta: Mapping[str, Any],
) -> WorkerResult:
    prepared = prepare(definition, params, data, meta, blank=bool(meta.get("blank")))
    if prepared.prepared is None:
        return WorkerResult(None, prepared.problems)
    bound = bind(definition, files, assets, prepared.prepared)
    return WorkerResult(bound.bound, [*prepared.problems, *bound.problems])


def _prepare_job(
    definition: ReportDefinition, params: Mapping[str, Any], data: Any, meta: Mapping[str, Any]
) -> PrepareOnly:
    prepared = prepare(definition, params, data, meta, blank=bool(meta.get("blank")))
    view = prepared.prepared.view_model() if prepared.prepared is not None else None
    return PrepareOnly(view, prepared.problems)


def _child(conn: Any, job: Any, *args: Any) -> None:
    try:
        result = job(*args)
    except Exception as exc:  # never let the child die silently; the message has no data in it
        result = WorkerResult(
            None, [error("RENDER_FAILED", f"{type(exc).__name__} while preparing the document")]
        )
    conn.send(result)
    conn.close()


@functools.cache
def _context() -> Any:
    if sys.platform == "win32":  # development machines: spawn is all Windows has
        return multiprocessing.get_context("spawn")
    # Not plain fork: the API process always has other threads (this call itself runs in one), and a
    # child forked while another thread holds a lock (logging, malloc) can hang until the timeout.
    # forkserver forks from a clean single-threaded server; preloading this module keeps each start fast.
    ctx = multiprocessing.get_context("forkserver")
    ctx.set_forkserver_preload([__name__])
    return ctx


def _run_blocking(timeout_s: float, args: tuple[Any, ...], job: Any = _job) -> Any:
    ctx = _context()
    receive, send = ctx.Pipe(duplex=False)
    process = ctx.Process(target=_child, args=(send, job, *args), daemon=True)
    process.start()
    send.close()
    try:
        if not receive.poll(timeout_s):
            raise WorkerTimeout
        return receive.recv()
    except EOFError:  # the child died without answering (killed by the OS, out of memory)
        return WorkerResult(None, [error("RENDER_FAILED", "the document worker stopped unexpectedly")])
    finally:
        if process.is_alive():
            process.kill()
        process.join(timeout=5)
        receive.close()


async def run_in_worker(
    definition: ReportDefinition,
    files: Mapping[str, str],
    assets: Mapping[str, AssetInfo],
    params: Mapping[str, Any],
    data: Any,
    meta: Mapping[str, Any],
    *,
    timeout_s: float,
) -> WorkerResult:
    """prepare + bind in a fresh process; raises WorkerTimeout after `timeout_s` (the process is killed)."""
    args = (definition, dict(files), dict(assets), dict(params), data, dict(meta))
    return await asyncio.to_thread(_run_blocking, timeout_s, args)  # waiting must not block the event loop


async def prepare_in_worker(
    definition: ReportDefinition,
    params: Mapping[str, Any],
    data: Any,
    meta: Mapping[str, Any],
    *,
    timeout_s: float,
) -> PrepareOnly:
    """data-prep alone (Studio's Prepared data tab), killed at the timeout like a render.

    A crash comes back as a WorkerResult with no bound document; callers read only `.problems` then.
    """
    args = (definition, dict(params), data, dict(meta))
    result = await asyncio.to_thread(_run_blocking, timeout_s, args, _prepare_job)
    return result if isinstance(result, PrepareOnly) else PrepareOnly(None, result.problems)
