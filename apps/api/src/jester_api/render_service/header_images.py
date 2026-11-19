"""Images in header.html / footer.html as data URIs (SPEC-binder.md v1.8).

Chromium draws a running header or footer outside the page, where relative file names do not load; the image
bytes go into the HTML instead. The bytes are fetched anyway for index.html, so this adds no request.
"""

from __future__ import annotations

import base64
import re
from collections.abc import Mapping

MAX_HEADER_IMAGE_BYTES = 1024 * 1024
_IMG_SRC = re.compile(rb"""(<img\b[^>]*?\ssrc\s*=\s*)(["'])([^"'{}]+)\2""", re.I)


class HeaderImageTooLarge(ValueError):
    """An image in header.html or footer.html is over MAX_HEADER_IMAGE_BYTES."""


def inline_images(html: bytes | None, images: Mapping[str, tuple[str, bytes]]) -> bytes | None:
    """html with each `<img src="name">` of `images` ({name: (content type, bytes)}) as a data URI."""
    if html is None:
        return None

    def swap(m: re.Match[bytes]) -> bytes:
        name = m.group(3).decode("utf-8", "replace")
        if name not in images:
            return m.group(0)
        content_type, data = images[name]
        if len(data) > MAX_HEADER_IMAGE_BYTES:
            raise HeaderImageTooLarge(f"{name} is larger than 1 MB; header and footer images must be smaller")
        uri = f"data:{content_type};base64,{base64.b64encode(data).decode('ascii')}"
        return m.group(1) + m.group(2) + uri.encode("ascii") + m.group(2)

    return _IMG_SRC.sub(swap, html)
