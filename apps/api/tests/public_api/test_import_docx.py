"""POST /v1/templates/import with a Word file (SPEC-public-api.md v1.15)."""

import pytest

from ..template_store.docx.conftest import docx, p
from ..template_store.docx.form import form_docx
from .test_contract import assert_fits

pytestmark = pytest.mark.db
WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def word(name: str = "แบบคำขอเบิกพัสดุ.docx", data: bytes | None = None) -> dict:
    return {"file": (name, data if data is not None else form_docx(), WORD)}


async def test_a_word_form_is_a_new_report_with_warnings(api, admin):
    created = await api.post(
        "/v1/templates/import", headers=admin, files=word(), data={"templateId": "requisition"}
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert (body["created"], body["revision"], body["warnings"]) == (True, 1, [])
    assert body["template"]["name"] == "แบบคำขอเบิกพัสดุ"  # from the file name
    assert_fits("ImportResult", body)

    floating = "<w:p><w:r><w:drawing><wp:anchor/></w:drawing></w:r></w:p>"
    named = await api.post(
        "/v1/templates/import",
        headers=admin,
        files=word("x.docx", docx(p("ก") + floating)),
        data={"templateId": "other", "name": "ชื่อที่ตั้ง"},
    )
    assert named.status_code == 201 and named.json()["template"]["name"] == "ชื่อที่ตั้ง"
    assert [w["code"] for w in named.json()["warnings"]] == ["DOCX_FLOATING_IMAGE"]
    assert named.json()["warnings"][0]["severity"] == "warning"


async def test_word_needs_a_new_id_and_never_replaces(api, admin):
    no_id = await api.post("/v1/templates/import", headers=admin, files=word())
    assert no_id.status_code == 422
    await api.post("/v1/templates/import", headers=admin, files=word(), data={"templateId": "requisition"})
    again = await api.post(
        "/v1/templates/import", headers=admin, files=word(), data={"templateId": "requisition"}
    )
    assert (again.status_code, again.json()["code"]) == (409, "CONFLICT")
    over = await api.post(
        "/v1/templates/import",
        headers={**admin, "If-Match": '"1"'},
        files=word(),
        data={"templateId": "requisition"},
    )
    assert over.status_code == 422
    unarchive = await api.post(
        "/v1/templates/import",
        headers=admin,
        files=word(),
        data={"templateId": "new-one", "unarchive": "true"},
    )
    assert unarchive.status_code == 422
    archived = await api.put("/v1/templates/requisition/archived", headers=admin, json={"archived": True})
    assert archived.status_code == 200
    still = await api.post(
        "/v1/templates/import", headers=admin, files=word(), data={"templateId": "requisition"}
    )
    assert (still.status_code, still.json()["code"]) == (409, "CONFLICT")


async def test_files_that_are_neither_a_template_zip_nor_word(api, admin):
    junk = await api.post(
        "/v1/templates/import", headers=admin, files={"file": ("a.docx", b"junk")}, data={"templateId": "x-y"}
    )
    assert junk.status_code == 422
    ole = bytes.fromhex("d0cf11e0a1b11ae1") + b"\0" * 64
    locked = await api.post(
        "/v1/templates/import", headers=admin, files=word("l.docx", ole), data={"templateId": "x-y"}
    )
    assert locked.status_code == 422 and "เข้ารหัส" in locked.json()["detail"]


async def test_a_template_zip_answers_empty_warnings(api, admin):
    await api.post("/v1/templates", headers=admin, json={"id": "t1", "name": "T", "starter": "blank"})
    zipped = (await api.get("/v1/templates/t1/export", headers=admin)).content
    moved = await api.post(
        "/v1/templates/import", headers=admin, files={"file": ("t1.zip", zipped)}, data={"templateId": "t2"}
    )
    assert moved.status_code == 201 and moved.json()["warnings"] == []
