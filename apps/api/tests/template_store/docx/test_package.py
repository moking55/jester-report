"""Reading an uploaded .docx without trusting it (SPEC-template-store.md v1.15 "ความปลอดภัย")."""

import io
import zipfile

import pytest

from jester_api.template_store import StoreError
from jester_api.template_store.docx.package import open_docx

from .conftest import docx, p


def code(fn, *args):
    with pytest.raises(StoreError) as exc:
        fn(*args)
    return exc.value.code, exc.value.message


def zip_of(files: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    return out.getvalue()


def test_reads_parts_and_relationships():
    data = docx(
        p("สวัสดี"), doc_rels={"rId5": ("image", "media/logo.png")}, parts={"word/media/logo.png": b"x"}
    )
    pkg = open_docx(data)
    assert pkg.xml("word/document.xml").tag.endswith("document")
    assert pkg.rels("word/document.xml") == {"rId5": "word/media/logo.png"}
    assert pkg.xml("word/styles.xml") is None  # an optional part that is not there


def test_external_and_escaping_relationships_are_not_followed():
    data = docx(
        p("x"),
        doc_rels={"rId1": ("image", "http://example.com/a.png"), "rId2": ("image", "../../etc/passwd")},
        external=frozenset({"rId1"}),
    )
    assert open_docx(data).rels("word/document.xml") == {}


def test_not_a_docx():
    assert code(open_docx, b"plain text")[0] == "INPUT_INVALID"
    assert "Word" in code(open_docx, zip_of({"jester.json": b"{}"}))[1]


def test_an_encrypted_or_old_word_file_says_so():
    ole = bytes.fromhex("d0cf11e0a1b11ae1") + b"\0" * 100
    status, message = code(open_docx, ole)
    assert status == "INPUT_INVALID" and "เข้ารหัส" in message


def test_doctype_is_refused_before_parsing():
    bomb = (
        '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]>'
        '<w:document xmlns:w="x">&lol2;</w:document>'
    )
    data = docx(p("x"), parts={"word/document.xml": bomb})
    pkg = open_docx(data)
    assert code(pkg.xml, "word/document.xml")[0] == "INPUT_INVALID"


def test_a_zip_bomb_stops_at_the_limit():
    data = docx(p("x"), parts={"word/document.xml": b"<a>" + b" " * (11 * 1024 * 1024) + b"</a>"})
    assert code(open_docx(data).xml, "word/document.xml")[0] == "PAYLOAD_TOO_LARGE"


def test_paths_that_leave_the_package_are_refused():
    base = {"[Content_Types].xml": b"<Types/>", "word/document.xml": b"<d/>"}
    for bad in ("../evil.xml", "/abs.xml", "word/../../x.xml"):  # (zipfile on Windows writes \ as /)
        assert code(open_docx, zip_of({**base, bad: b"x"}))[0] == "INPUT_INVALID"


def test_too_many_entries():
    files = {"[Content_Types].xml": b"<Types/>", "word/document.xml": b"<d/>"}
    files |= {f"word/media/i{n}.png": b"x" for n in range(1001)}
    assert code(open_docx, zip_of(files))[0] == "PAYLOAD_TOO_LARGE"


def test_size_limit():
    assert code(open_docx, b"PK" + b"\0" * (25 * 1024 * 1024 + 1))[0] == "PAYLOAD_TOO_LARGE"
