import base64

import pytest

from jester_api.render_service.header_images import HeaderImageTooLarge, inline_images

PNG = b"\x89PNG\r\n\x1a\nxx"
IMAGES = {"logo.png": ("image/png", PNG)}


def test_known_asset_becomes_a_data_uri_and_the_rest_stays():
    html = (
        b'<img src="logo.png" height="20"> <img src=\'logo.png\'> '
        b'<img src="https://x/y.png"> <img src="other.png">'
    )
    out = inline_images(html, IMAGES).decode()
    uri = "data:image/png;base64," + base64.b64encode(PNG).decode()
    assert out.count(uri) == 2 and 'src="https://x/y.png"' in out and 'src="other.png"' in out


def test_none_and_html_without_images_pass_through():
    assert inline_images(None, IMAGES) is None
    assert inline_images(b"<p>x</p>", IMAGES) == b"<p>x</p>"


def test_an_image_over_one_megabyte_is_refused():
    big = {"logo.png": ("image/png", b"0" * (1024 * 1024 + 1))}
    with pytest.raises(HeaderImageTooLarge):
        inline_images(b'<img src="logo.png">', big)
