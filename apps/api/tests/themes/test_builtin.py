import pytest

from jester_api.themes import BUILTIN, check_tokens

SURIYAN = BUILTIN["suriyan"]["tokens"]


def test_built_in_themes_pass_their_own_rules():
    for theme in BUILTIN.values():
        assert check_tokens(theme["tokens"]) == []


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("color.primary", "red;}body{display:none"),
        ("color.primary", "#d9730d;}"),
        ("color.text", "</style><script>"),
        ("color.text", "#fff"),
        ("font.family", "Comic Sans; color: red"),
        ("font.size", 19),
        ("font.size", 14.5),
        ("font.size", "14"),
        ("radius", True),
        ("radius", -1),
        ("shadow", "0 0 9px red"),
        ("density", None),
    ],
)
def test_bad_values_point_at_the_token(key, value):
    problems = check_tokens({**SURIYAN, key: value})
    assert [p.pointer for p in problems] == [f"/tokens/{key}"]


def test_unknown_and_missing_tokens():
    tokens = {k: v for k, v in SURIYAN.items() if k != "radius"} | {"css": "body{}"}
    assert sorted(p.pointer for p in check_tokens(tokens)) == ["/tokens/css", "/tokens/radius"]
    assert [p.pointer for p in check_tokens(["#fff"])] == ["/tokens"]
