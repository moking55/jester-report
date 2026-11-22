import json
from pathlib import Path

import pytest

from jester_api.tags import COLORS, TagError, normalize_tags


def test_trims_collapses_spaces_and_keeps_order():
    assert normalize_tags(["  ลูกค้า-ก ", "ไตรมาส   4", "VIP"]) == ["ลูกค้า-ก", "ไตรมาส 4", "VIP"]


def test_nfc():
    assert normalize_tags(["é"]) == ["é"]


def test_exact_match_is_case_sensitive():
    assert normalize_tags(["VIP", "vip"]) == ["VIP", "vip"]


def test_duplicates_merge_after_normalising_keeping_first():
    assert normalize_tags(["a", " a ", "b", "a  "]) == ["a", "b"]


def test_empty_and_none_are_the_empty_set():
    assert normalize_tags([]) == []
    assert normalize_tags(None) == []


def test_length_limits():
    assert normalize_tags(["ก" * 30]) == ["ก" * 30]
    with pytest.raises(TagError) as err:
        normalize_tags(["ok", "ก" * 31])
    assert err.value.tag == "ก" * 31
    with pytest.raises(TagError):
        normalize_tags(["   "])


def test_at_most_ten_after_merging_duplicates():
    names = [f"t{i}" for i in range(10)]
    assert normalize_tags([*names, "t0"]) == names
    with pytest.raises(TagError, match="10"):
        normalize_tags([*names, "t10"])


@pytest.mark.parametrize("bad", ["a,b", "a\x00b", "a\x07", "a\x7fb"])
def test_comma_and_control_characters_name_the_tag(bad):
    with pytest.raises(TagError) as err:
        normalize_tags(["fine", bad])
    assert err.value.tag == bad


def test_non_strings_are_rejected():
    with pytest.raises(TagError):
        normalize_tags(["a", 3])  # type: ignore[list-item]
    with pytest.raises(TagError):
        normalize_tags("abc")  # type: ignore[arg-type]


def test_palette():
    assert COLORS == ("gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink")


CASES = json.loads((Path(__file__).parent / "cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES["ok"])
def test_shared_cases_ok(case):
    assert normalize_tags(case["input"]) == case["output"]


@pytest.mark.parametrize("case", CASES["bad"])
def test_shared_cases_bad(case):
    with pytest.raises(TagError) as err:
        normalize_tags(case["input"])
    assert err.value.tag == case["tag"]
