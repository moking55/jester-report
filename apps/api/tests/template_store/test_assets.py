import base64
import hashlib
import io
from pathlib import Path

import pytest
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen

from jester_api.template_store.assets import detect
from jester_api.template_store.errors import StoreError

ROOT = Path(__file__).parents[4]
SARABUN = ROOT / "infra" / "gotenberg" / "fonts"
NOTO = ROOT / "spikes" / "m0" / "fonts" / "NotoSansThai.ttf"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)

# 1x1 images written by sharp (libwebp, libheif); AVIF_MIF1 is the same file led by the `mif1` brand
WEBP = base64.b64decode(
    "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA="
)
AVIF = base64.b64decode(
    "AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9j"
    "AAAAAERAAAEAAQAAAAAA+gABAAAAAAAAACQAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlw"
    "cnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMA"
    "AAAsbWRhdBIACgc4AAaQENBpMhcZQmMEwAA0AACQQMkcYUuNGtYQVLH7IA=="
)
AVIF_MIF1 = AVIF[:8] + b"mif1" + AVIF[12:]
GIF = base64.b64decode("R0lGODlhAQABAIAAAExpcf8AACH5BAUAAAAALAAAAAABAAEAAAICTAEAOw==")
# 1x1 24-bit BMP: file header, BITMAPINFOHEADER, one pixel padded to 4 bytes
BMP = bytes.fromhex("424d3a000000000000003600000028000000010000000100000001001800" + "00" * 24 + "0000ff00")


def _otf(family: str) -> bytes:
    fb = FontBuilder(1000, isTTF=False)
    fb.setupGlyphOrder([".notdef"])
    fb.setupCharacterMap({})
    pen = T2CharStringPen(500, None)
    fb.setupCFF(family.replace(" ", ""), {"FullName": family}, {".notdef": pen.getCharString()}, {})
    fb.setupHorizontalMetrics({".notdef": (500, 0)})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": family, "styleName": "Regular"})
    fb.setupOS2()
    fb.setupPost()
    out = io.BytesIO()
    fb.save(out)
    return out.getvalue()


@pytest.mark.parametrize("file", ["THSarabunNew-Regular.ttf", "THSarabunNew-Bold.ttf"])
def test_thai_font_family_is_read(file):
    data = (SARABUN / file).read_bytes()
    info = detect(file, data)
    assert info.font_family == "TH Sarabun New" and info.content_type == "font/ttf"
    assert info.sha256 == hashlib.sha256(data).hexdigest()


def test_noto_and_otf():
    assert detect("noto.ttf", NOTO.read_bytes()).font_family == "Noto Sans Thai"
    info = detect("my.otf", _otf("My Font"))
    assert (info.content_type, info.font_family) == ("font/otf", "My Font")


@pytest.mark.parametrize(
    ("name", "data", "content_type"),
    [
        ("logo.png", PNG, "image/png"),
        ("photo.jpg", b"\xff\xd8\xff\xe0rest", "image/jpeg"),
        ("photo.JPEG", b"\xff\xd8\xff\xe0rest", "image/jpeg"),
        ("a.svg", b'<svg xmlns="http://www.w3.org/2000/svg"/>', "image/svg+xml"),
        (
            "b.svg",
            b'\xef\xbb\xbf<?xml version="1.0"?>\n<!-- logo -->\n<svg viewBox="0 0 1 1"></svg>',
            "image/svg+xml",
        ),
        ("photo.webp", WEBP, "image/webp"),
        ("photo.avif", AVIF, "image/avif"),
        ("photo.avif", AVIF_MIF1, "image/avif"),
        ("scan.BMP", BMP, "image/bmp"),
        ("anim.gif", GIF, "image/gif"),  # accepted from v1.7
    ],
)
def test_images(name, data, content_type):
    info = detect(name, data)
    assert info.content_type == content_type and info.font_family is None


@pytest.mark.parametrize(
    ("name", "data"),
    [
        ("logo.png", b"<html>not a png</html>"),
        ("font.ttf", PNG),
        ("font.ttf", b"\x00\x01\x00\x00garbage"),  # right magic, unreadable font
        ("font.woff2", b"wOF2...."),  # not accepted in v1
        ("doc.svg", b"<html><body>no svg here</body></html>"),
        ("doc.svg", b"text before <svg></svg>"),
        ("noext", PNG),
        ("script.js", b"alert(1)"),
        ("anim.gif", PNG),  # a png named .gif
        ("logo.png", GIF),
        ("logo.webp", PNG),
        ("logo.webp", b"RIFF\0\0\0\0WAVEfmt "),  # RIFF, but audio
        ("logo.avif", b"\0\0\0\x18ftypheic\0\0\0\0mif1heic"),  # HEIC, not AVIF
        ("logo.bmp", PNG),
    ],
)
def test_rejected(name, data):
    with pytest.raises(StoreError) as e:
        detect(name, data)
    assert e.value.code == "UNSUPPORTED_MEDIA_TYPE"
