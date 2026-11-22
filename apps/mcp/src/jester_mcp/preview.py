"""PDF pages -> PNG so the model can compare a preview with the source document (SPEC-mcp.md assumption 7).

pypdfium2 renders; PNG is written with zlib from the standard library (no Pillow).
"""

from __future__ import annotations

import struct
import zlib

import pypdfium2 as pdfium

MAX_PAGES = 5
WIDTH_PX = 1000


def png_rgb(width: int, height: int, stride: int, pixels: bytes) -> bytes:
    """8-bit RGB PNG from rows of `stride` bytes (only the first width*3 of each row are pixels)."""
    row = width * 3
    raw = b"".join(b"\x00" + pixels[y * stride : y * stride + row] for y in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 6))
        + chunk(b"IEND", b"")
    )


def pdf_pages_png(
    pdf: bytes, max_pages: int = MAX_PAGES, width_px: int = WIDTH_PX
) -> tuple[list[bytes], int]:
    """(PNG of the first `max_pages` pages, total page count). ValueError when pdfium cannot read it."""
    try:
        doc = pdfium.PdfDocument(pdf)
    except pdfium.PdfiumError as e:
        raise ValueError(f"not a readable PDF: {e}") from e
    try:
        images = []
        for i in range(min(len(doc), max_pages)):
            page = doc[i]
            bitmap = page.render(scale=width_px / page.get_width(), rev_byteorder=True)  # RGB, 3 channels
            images.append(png_rgb(bitmap.width, bitmap.height, bitmap.stride, bytes(bitmap.buffer)))
            bitmap.close()
            page.close()
        return images, len(doc)
    finally:
        doc.close()
