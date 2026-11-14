import pytest

from jester_api.binder.resources import check_resources

FILES = {
    "report.css": "body { font-size: 16pt; }\n.x { background: url(bg.png); }\n",
    "template.html": "<p>partials are never sent</p>",
    "p.html": "<p></p>",
}
ASSETS = ["logo.png", "bg.png", "font.ttf"]


def scan(html, files=FILES, assets=ASSETS, name="template.html"):
    return check_resources({name: html}, files, assets)


def codes(problems):
    return [p.code for p in problems]


def test_draft_files_and_assets_are_collected():
    problems, files, assets = scan('<link rel="stylesheet" href="report.css"><img src="logo.png">')
    assert problems == [] and files == ("report.css",) and assets == ("bg.png", "logo.png")


def test_css_file_refs_are_followed():
    files = {"a.css": '@import "b.css";', "b.css": "@font-face { src: url('font.ttf'); }"}
    problems, used, assets = scan('<link href="a.css">', files=files)
    assert problems == [] and used == ("a.css", "b.css") and assets == ("font.ttf",)


@pytest.mark.parametrize(
    "html",
    [
        '<img src="http://10.0.0.1/x">',
        '<img src="HTTP://X/y">',
        '<img src="//evil/x">',
        '<img src="file:///etc/passwd">',
        "<img src=http://169.254.169.254/latest>",  # unquoted (only possible through |safe)
        '<img src="&#104;ttp://evil/x">',  # entity-encoded
        '<img srcset="logo.png 1x, http://evil/x 2x">',
        '<video poster="http://evil/x"></video>',
        '<object data="http://evil/x"></object>',
        '<svg><image xlink:href="http://evil/x"/></svg>',
        '<base href="http://evil/">',
        '<p style="background: url(http://evil/x)">',
        '<style>@import "http://evil/x.css";</style>',
        '<img src="unknown.png">',
        '<link href="p.html">',
    ],
)
def test_anything_but_draft_files_and_assets_is_rejected(html):
    problems, _, _ = scan(html)
    assert codes(problems) == ["RESOURCE_NOT_ALLOWED"]
    assert "evil" not in problems[0].message and "10.0.0.1" not in problems[0].message


def test_links_data_uris_and_fragments_are_fine():
    problems, _, _ = scan(
        '<a href="https://example.com">x</a><img src="data:image/png;base64,AA"><use href="#i">'
    )
    assert problems == []


def test_scripts_handlers_srcdoc_and_tfoot():
    html = '<script>x</script><img src="logo.png" onerror="x"><iframe srcdoc="x"></iframe><table><tfoot>'
    assert sorted(codes(scan(html)[0])) == [
        "RESOURCE_NOT_ALLOWED",
        "SCRIPT_NOT_ALLOWED",
        "SCRIPT_NOT_ALLOWED",
        "TFOOT_FORBIDDEN",
    ]


def test_commented_out_markup_is_ignored():
    assert scan("<!-- <img src='http://x/y'> <script> -->")[0] == []


@pytest.mark.parametrize(("opener", "closer"), [("/*", "*/"), ("{#", "#}")])
def test_data_cannot_fake_a_comment_to_hide_a_tag(opener, closer):
    from jester_api.binder.environment import BindEnvironment, render

    env = BindEnvironment({"t.html": '<p>{{ data.a }}</p><img src="{{ data.logo }}"><p>{{ data.b }}</p>'})
    data = {"a": opener, "b": closer, "logo": "http://169.254.169.254/latest"}
    out, _ = render(env, "t.html", {"data": data}, 10**6)
    assert codes(scan(out)[0]) == ["RESOURCE_NOT_ALLOWED"]


@pytest.mark.parametrize(
    "html",
    [
        "<p style=\"background-image: image-set('http://evil/x' 1x)\">",
        '<p style="background: \\75 rl(http://evil/x)">',  # CSS escape for "u"
        '<p style="background: &#117;rl(http://evil/x)">',  # html entity inside the attribute
        "<img alt=it's src=http://evil/x>",  # unbalanced quote hides the tag from the tag regex
    ],
)
def test_css_and_markup_tricks_fail_closed(html):
    assert "RESOURCE_NOT_ALLOWED" in codes(scan(html)[0])


def test_static_css_problems_have_lines():
    problems, _, _ = scan(
        '<link href="report.css">', files={"report.css": "a{}\nb { background: url(nope.png) }"}
    )
    assert [(p.file, p.line) for p in problems] == [("report.css", 2)]
