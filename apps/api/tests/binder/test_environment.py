import pytest

from jester_api.binder.environment import MAX_OUTPUT_BYTES, BindEnvironment, render
from jester_api.data_prep import FORMATTERS

CTX = {"item": {"amount": 1}, "data": {"x": None, "customer": {"name": "ACME"}}, "fmt": FORMATTERS}


def run(templates, name="t.html", ctx=CTX, budget=MAX_OUTPUT_BYTES):
    env = BindEnvironment(templates)
    out, problems = render(env, name, ctx, budget)
    return out, problems, env.warnings


def where(problems):
    return [(p.code, p.file, p.line) for p in problems]


def test_typo_points_at_template_line():
    _, problems, _ = run({"t.html": "a\n{{ item.amont }}\n"})
    assert where(problems) == [("TEMPLATE_UNDEFINED", "t.html", 2)]
    assert "amont" in problems[0].message


def test_typo_inside_included_partial_points_at_partial():
    _, problems, _ = run({"t.html": "x\n{% include 'p.html' %}", "p.html": "1\n2\n{{ data.nope }}"})
    assert where(problems) == [("TEMPLATE_UNDEFINED", "p.html", 3)]


def test_sandbox_blocks_dunder_access():
    for src in ("{{ fmt.__class__ }}", "{{ ''.__class__.__mro__ }}"):
        _, problems, _ = run({"t.html": src})
        assert [p.code for p in problems] == ["TEMPLATE_UNSAFE"]


def test_formatter_error_has_line_and_no_value():
    _, problems, _ = run({"t.html": "\n\n{{ fmt.money(data.customer.name) }}"})
    assert where(problems) == [("TEMPLATE_ERROR", "t.html", 3)]
    assert "ACME" not in problems[0].message


def test_other_errors_only_name_the_exception_type():
    _, problems, _ = run({"t.html": "{{ data.customer.name / 2 }}"})
    assert problems[0].code == "TEMPLATE_ERROR" and "ACME" not in problems[0].message


def test_missing_include_and_syntax_error():
    assert where(run({"t.html": "{% include 'gone.html' %}"})[1]) == [("TEMPLATE_ERROR", "t.html", 1)]
    assert where(run({"t.html": "ok\n{% for %}"})[1]) == [("TEMPLATE_SYNTAX", "t.html", 2)]


def test_none_is_blank_and_objects_warn_once_per_line():
    out, problems, warnings = run({"t.html": "[{{ data.x }}]{{ data }}{{ data }}\n{{ data.customer }}"})
    assert problems == [] and out == "[]\n"
    assert where(warnings) == [
        ("TEMPLATE_PRINTS_OBJECT", "t.html", 1),
        ("TEMPLATE_PRINTS_OBJECT", "t.html", 2),
    ]
    assert all(w.severity == "warning" for w in warnings)


def test_functions_groups_and_floats_never_print_their_repr():
    from decimal import Decimal

    from jester_api.data_prep import Group

    ctx = {**CTX, "g": Group("North", [{"secret": "S"}], {}), "n": Decimal("1.50"), "i": 3, "b": True}
    out, problems, warnings = run({"t.html": "{{ fmt.money }}|{{ g }}|{{ n }}|{{ i }}|{{ b }}"}, ctx=ctx)
    assert problems == [] and out == "||1.50|3|True"
    assert [w.code for w in warnings] == ["TEMPLATE_PRINTS_OBJECT"]  # once per line


@pytest.mark.parametrize("value", ["<b>x</b>", '" onerror="alert(1)', "<script>x</script>"])
def test_data_is_escaped(value):
    out, _, _ = run({"t.html": '<p title="{{ v }}">{{ v }}</p>'}, ctx={"v": value})
    assert "<b>" not in out and "<script>" not in out and '" onerror' not in out


def test_output_limit_stops_streaming():
    out, problems, _ = run(
        {"t.html": "{% for i in range(1000) %}{{ s }}{% endfor %}"}, ctx={"s": "y" * 100}, budget=5000
    )
    assert out is None and where(problems) == [("OUTPUT_TOO_LARGE", "t.html", None)]


def test_lipsum_is_not_available():
    assert run({"t.html": "{{ lipsum() }}"})[1][0].code == "TEMPLATE_UNDEFINED"


def test_undefined_key_from_data_is_not_echoed():
    templates = {"t.html": "\n{{ data.prices[item.code] }}"}
    _, problems, _ = run(templates, ctx={"data": {"prices": {}}, "item": {"code": "SECRET-123"}})
    assert where(problems) == [("TEMPLATE_UNDEFINED", "t.html", 2)]
    assert "SECRET" not in problems[0].message
