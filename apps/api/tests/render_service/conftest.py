import io
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject

from jester_api.auth import Principal, User
from jester_api.engine_client import EngineClient
from jester_api.render_service import RenderService, RenderSettings
from jester_api.template_store import MemoryBlobStore, TemplateStore


class Clock:
    def __init__(self) -> None:
        self.now = datetime(2026, 11, 14, 9, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs: float) -> None:
        self.now += timedelta(**kwargs)


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
async def pool(db_url):
    from psycopg_pool import AsyncConnectionPool

    from jester_api.db import migrate

    async with AsyncConnectionPool(db_url, min_size=1, max_size=8, open=False) as p:
        async with p.connection() as conn:
            await migrate(conn)
        yield p


def pdf_with_font(base_font: str) -> bytes:
    writer = PdfWriter()
    page = writer.add_blank_page(100, 100)
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type0"),
            NameObject("/BaseFont"): NameObject(f"/ABCDEF+{base_font}"),
        }
    )
    page[NameObject("/Resources")] = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
    )
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


BASE = "http://engine.test"
ALICE = Principal("user", "alice", user=User(uuid.uuid4(), "alice", None, None))  # type: ignore[arg-type]
KEY = Principal("api_key", "api-key:erp", api_key_id=uuid.uuid4())
PARAMS = {"quoteId": "Q-1", "docDate": "2026-11-14"}
SAMPLE = {
    "company": {"name": "บริษัท ตัวอย่าง จำกัด"},
    "customer": {"name": "ลูกค้า"},
    "discount": "100.70",
    "items": [{"id": "QL01", "description": "x", "qty": 2, "unitPrice": "1250.50"}],
}


@pytest.fixture
def engine_route():
    with respx.mock(base_url=BASE, assert_all_called=False) as mock:
        mock.get("/health").mock(return_value=httpx.Response(200, json={"status": "up"}))
        mock.get("/version").mock(return_value=httpx.Response(200, text="9.4.1"))
        yield mock.post("/forms/chromium/convert/html").mock(
            return_value=httpx.Response(
                200, content=pdf_with_font("THSarabunNew"), headers={"Gotenberg-Trace": "t1"}
            )
        )


@pytest.fixture
async def setup(pool, clock, engine_route):
    blobs = MemoryBlobStore()
    store = TemplateStore(pool, blobs)
    await store.create("quote", "Q", "quotation", "alice")
    await store.publish("quote", 1, None, "alice")
    async with EngineClient(BASE) as engine:
        yield store, RenderService(store, engine, pool, RenderSettings(bind_timeout_s=30), clock), blobs
