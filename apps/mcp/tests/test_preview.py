import base64
import io
import json
import struct
import zlib

import pypdfium2 as pdfium
import pytest
import respx
from mcp.server.mcpserver.exceptions import ToolError

from jester_mcp.preview import pdf_pages_png, png_rgb

from .conftest import API


def blank_pdf(pages: int) -> bytes:
    doc = pdfium.PdfDocument.new()
    for _ in range(pages):
        doc.new_page(595, 842)  # A4 in points
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()


def decode_png(png: bytes) -> tuple[int, int, bytes]:
    """(width, height, filtered rows) of a PNG written by png_rgb; checks signature and CRCs."""
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    pos, chunks = 8, {}
    while pos < len(png):
        (length,) = struct.unpack(">I", png[pos : pos + 4])
        kind, data = png[pos + 4 : pos + 8], png[pos + 8 : pos + 8 + length]
        (crc,) = struct.unpack(">I", png[pos + 8 + length : pos + 12 + length])
        assert crc == zlib.crc32(kind + data)
        chunks[kind] = data
        pos += 12 + length
    width, height, depth, color = struct.unpack(">IIBB", chunks[b"IHDR"][:10])
    assert (depth, color) == (8, 2)
    return width, height, zlib.decompress(chunks[b"IDAT"])


def test_png_rgb_drops_row_padding():
    pixels = bytes([255, 0, 0, 9, 9]) + bytes([0, 0, 255, 9, 9])  # 1x2 image, stride 5 (2 bytes padding)
    width, height, raw = decode_png(png_rgb(1, 2, 5, pixels))
    assert (width, height, raw) == (1, 2, b"\x00\xff\x00\x00\x00\x00\x00\xff")


def test_first_five_pages_at_1000_px():
    images, pages = pdf_pages_png(blank_pdf(7))
    assert (len(images), pages) == (5, 7)
    width, height, raw = decode_png(images[0])
    assert width == 1000 and 1410 <= height <= 1416  # A4 ratio
    assert raw[1:4] == b"\xff\xff\xff"  # a blank page is white


def test_unreadable_pdf():
    with pytest.raises(ValueError):
        pdf_pages_png(b"not a pdf")


async def test_preview_tool_returns_images_and_a_summary(signed_in):
    with respx.mock(base_url=API) as mock:
        route = mock.post("/v1/templates/quotation/draft/preview").respond(
            200, content=blank_pdf(2), headers={"Jester-Run-Id": "run_9", "Content-Type": "application/pdf"}
        )
        result = await signed_in.call_tool(
            "preview_draft", {"template_id": "quotation", "data": {"total": "1250.50"}}
        )
    assert not result.is_error
    text, *images = result.content
    assert json.loads(text.text) == {
        "pages": 2,
        "shown": 2,
        "runId": "run_9",
        "studioUrl": "https://jester.example.com/templates/quotation",
    }
    assert [i.mime_type for i in images] == ["image/png", "image/png"]
    assert base64.b64decode(images[0].data)[:4] == b"\x89PNG"
    assert json.loads(route.calls.last.request.content) == {"data": {"total": "1250.50"}}


async def test_preview_tool_reports_a_broken_pdf(signed_in):
    with respx.mock(base_url=API) as mock:
        mock.post("/v1/templates/quotation/draft/preview").respond(200, content=b"oops")
        with pytest.raises(ToolError, match="not a readable PDF"):
            await signed_in.call_tool("preview_draft", {"template_id": "quotation"})
