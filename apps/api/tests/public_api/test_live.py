"""Live: the whole docker compose stack over real HTTP (JESTER_TEST_API_URL, JESTER_TEST_SETUP_TOKEN)."""

import io
import os

import httpx
import pytest
from pypdf import PdfReader

pytestmark = pytest.mark.live_stack
PASSWORD = "correct horse battery staple"
PARAMS = {"quoteId": "Q-LIVE-1", "docDate": "2026-11-14"}
DATA = {
    "company": {"name": "บริษัท ตัวอย่าง จำกัด"},
    "customer": {"name": "ลูกค้า"},
    "discount": "100.70",
    "items": [
        {"id": "QL01", "description": "บริการติดตั้งระบบรายงาน", "qty": 2, "unitPrice": "1250.50"},
        {"id": "QL02", "description": "ค่าอบรมผู้ใช้งาน", "qty": 3, "unitPrice": "199.90"},
    ],
}


async def test_compose_stack_end_to_end():
    async with httpx.AsyncClient(base_url=os.environ["JESTER_TEST_API_URL"], timeout=120) as api:
        health = (await api.get("/v1/health")).json()
        assert health["status"] == "up", health
        assert (await api.get("/v1/openapi.yaml")).text.startswith("openapi: 3.1.0")

        if (await api.get("/v1/setup")).json()["setupRequired"]:
            setup = await api.post(
                "/v1/setup",
                json={
                    "setupToken": os.environ["JESTER_TEST_SETUP_TOKEN"],
                    "username": "admin",
                    "password": PASSWORD,
                },
            )
            assert setup.status_code == 201, setup.text
        login = await api.post("/v1/auth/login", json={"username": "admin", "password": PASSWORD})
        user = {"Authorization": f"Bearer {login.json()['token']}"}

        template_id = f"live-{os.urandom(3).hex()}"
        created = await api.post(
            "/v1/templates",
            headers=user,
            json={"id": template_id, "name": "ใบเสนอราคา", "starter": "quotation"},
        )
        assert created.status_code == 201, created.text
        published = await api.post(
            f"/v1/templates/{template_id}/versions", headers={**user, "If-Match": "1"}, json={}
        )
        assert published.status_code == 201, published.text

        key = (await api.post("/v1/api-keys", headers=user, json={"name": "live-test"})).json()
        rendered = await api.post(
            "/v1/render",
            headers={"Authorization": f"Bearer {key['secret']}"},
            json={"template": {"id": template_id, "version": "published"}, "params": PARAMS, "data": DATA},
        )
        assert rendered.status_code == 200, rendered.text
        text = "".join(p.extract_text() for p in PdfReader(io.BytesIO(rendered.content)).pages)
        assert "3,210.00" in text  # the quotation totals computed by data-prep, through the real engine
        run = (await api.get(f"/v1/runs/{rendered.headers['Jester-Run-Id']}", headers=user)).json()
        assert run["status"] == "succeeded" and run["provenance"]["engineVersion"] == "9.4.1"
        await api.delete(f"/v1/api-keys/{key['id']}", headers=user)
