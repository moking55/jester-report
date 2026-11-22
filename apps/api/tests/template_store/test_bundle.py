"""Template zip: round trip and one test per row of the safety table (SPEC-template-store.md "A1")."""

import base64
import hashlib
import io
import json
import stat
import zipfile

import pytest

from jester_api.template_store import StoreError
from jester_api.template_store.bundle import MANIFEST, read_zip, write_zip

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
FILES = {"report.json": '{"page": {}}', "template.html": "<p>สวัสดี</p>"}


def manifest(files=FILES, assets=None, **extra):
    assets = {"logo.png": PNG} if assets is None else assets
    return {
        "formatVersion": 1,
        "id": "quote",
        "name": "ใบเสนอราคา",
        "source": {"kind": "draft", "revision": 3},
        "exportedAt": "2026-11-18T10:00:00Z",
        "files": sorted(files),
        "assets": [{"name": n, "sha256": hashlib.sha256(b).hexdigest()} for n, b in sorted(assets.items())],
        **extra,
    }


def raw_zip(entries, compression=zipfile.ZIP_DEFLATED, attrs=None):
    """A zip built by hand, so tests can make every kind of bad entry."""
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression) as zf:
        for name, data in entries:
            info = zipfile.ZipInfo(name)
            info.compress_type = compression
            info.external_attr = (attrs or {}).get(name, (stat.S_IFREG | 0o644) << 16)
            zf.writestr(info, data)
    return out.getvalue()


def good_entries(m=None):
    m = m or manifest()
    return [(MANIFEST, json.dumps(m)), *FILES.items(), ("logo.png", PNG)]


def code_of(data) -> str:
    with pytest.raises(StoreError) as e:
        read_zip(data)
    return e.value.code


def test_round_trip_and_deterministic_bytes():
    m = manifest()
    data = write_zip(m, FILES, {"logo.png": PNG})
    assert data == write_zip(m, FILES, {"logo.png": PNG})
    bundle = read_zip(data)
    assert (bundle.id, bundle.name) == ("quote", "ใบเสนอราคา")
    assert (bundle.files, bundle.assets) == (FILES, {"logo.png": PNG})
    names = zipfile.ZipFile(io.BytesIO(data)).namelist()
    assert names == sorted(names) and MANIFEST in names


def test_stored_entries_are_accepted():
    assert read_zip(raw_zip(good_entries(), zipfile.ZIP_STORED)).files == FILES


def test_zip_over_25_mb_is_too_large():
    assert code_of(b"PK" + b"\0" * (25 * 1024 * 1024)) == "PAYLOAD_TOO_LARGE"


def test_not_a_zip():
    assert code_of(b"not a zip") == "INPUT_INVALID"


def test_too_many_entries():
    extra = [(f"f{i}.css", "p{}") for i in range(101)]
    assert code_of(raw_zip(good_entries() + extra)) == "PAYLOAD_TOO_LARGE"


@pytest.mark.parametrize("name", ["../evil.html", "a/b.html", "a\\b.html", ".hidden.css", "dir/"])
def test_paths_and_hidden_names_are_rejected(name):
    assert code_of(raw_zip([*good_entries(), (name, "x")])) == "INPUT_INVALID"


def test_symlink_is_rejected():
    attrs = {"evil.css": (stat.S_IFLNK | 0o777) << 16}
    assert code_of(raw_zip([*good_entries(), ("evil.css", "/etc/passwd")], attrs=attrs)) == "INPUT_INVALID"


def test_other_compression_is_rejected():
    assert code_of(raw_zip(good_entries(), zipfile.ZIP_BZIP2)) == "INPUT_INVALID"


def test_encrypted_entry_is_rejected():
    data = bytearray(raw_zip(good_entries(), zipfile.ZIP_STORED))
    # set the "encrypted" flag on every local and central header
    for sig, offset in ((b"PK\x03\x04", 6), (b"PK\x01\x02", 8)):
        start = 0
        while (i := data.find(sig, start)) != -1:
            data[i + offset] |= 0x1
            start = i + 4
    assert code_of(bytes(data)) == "INPUT_INVALID"


def test_duplicate_entry_is_rejected():
    with pytest.warns(UserWarning):  # zipfile itself warns about the duplicate name
        data = raw_zip([*good_entries(), ("template.html", "<p>again</p>")])
    assert code_of(data) == "INPUT_INVALID"


def test_entry_outside_the_manifest_is_rejected():
    assert code_of(raw_zip([*good_entries(), ("extra.css", "p{}")])) == "INPUT_INVALID"


def test_manifest_naming_a_missing_file_is_rejected():
    m = manifest(files={**FILES, "missing.css": ""})
    assert code_of(raw_zip(good_entries(m))) == "INPUT_INVALID"


@pytest.mark.parametrize("name", ["index.html", "evil.exe", "x.js"])
def test_names_outside_the_contract_patterns(name):
    files = {**FILES, name: "x"}
    entries = [(MANIFEST, json.dumps(manifest(files=files))), *files.items(), ("logo.png", PNG)]
    assert code_of(raw_zip(entries)) == "INPUT_INVALID"


def test_missing_required_file_is_conflict():
    files = {"report.json": "{}"}
    entries = [(MANIFEST, json.dumps(manifest(files=files))), *files.items(), ("logo.png", PNG)]
    assert code_of(raw_zip(entries)) == "CONFLICT"


def lie_about_size(data: bytes, name: str, size: int) -> bytes:
    """Write a false uncompressed size for `name` into its local and central headers."""
    out = bytearray(data)
    zf = zipfile.ZipFile(io.BytesIO(data))
    local = zf.getinfo(name).header_offset
    out[local + 22 : local + 26] = size.to_bytes(4, "little")
    i = zf.start_dir
    while out[i : i + 4] == b"PK\x01\x02":
        n, m, k = (int.from_bytes(out[i + o : i + o + 2], "little") for o in (28, 30, 32))
        if out[i + 46 : i + 46 + n] == name.encode():
            out[i + 24 : i + 28] = size.to_bytes(4, "little")
        i += 46 + n + m + k
    return bytes(out)


def bomb_zip() -> bytes:
    bomb = "<!--" + " " * (30 * 1024 * 1024) + "-->"  # deflates to about 30 KB
    files = {**FILES, "bomb.html": bomb}
    return raw_zip([(MANIFEST, json.dumps(manifest(files=files))), *files.items(), ("logo.png", PNG)])


def test_zip_bomb_stops_at_the_limit():
    assert code_of(bomb_zip()) == "PAYLOAD_TOO_LARGE"


def test_zip_bomb_with_a_lying_header_is_rejected():
    """The header says 1 KB; reading never trusts it, so the entry fails instead of inflating 30 MB."""
    assert code_of(lie_about_size(bomb_zip(), "bomb.html", 1024)) in {"INPUT_INVALID", "PAYLOAD_TOO_LARGE"}


def test_text_over_1_mb_and_draft_over_20_mb():
    big = {**FILES, "big.css": "a" * (1024 * 1024 + 1)}
    entries = [(MANIFEST, json.dumps(manifest(files=big))), *big.items(), ("logo.png", PNG)]
    assert code_of(raw_zip(entries)) == "PAYLOAD_TOO_LARGE"
    fonts = {f"f{i}.ttf": bytes([i]) * (5 * 1024 * 1024) for i in range(5)}
    entries = [(MANIFEST, json.dumps(manifest(assets=fonts))), *FILES.items(), *fonts.items()]
    assert code_of(raw_zip(entries)) == "PAYLOAD_TOO_LARGE"


def test_text_that_is_not_utf8():
    entries = good_entries()
    entries[2] = ("template.html", "<p>ภาษาไทย</p>".encode("cp874"))
    assert code_of(raw_zip(entries)) == "INPUT_INVALID"


@pytest.mark.parametrize(
    "change",
    [
        {"formatVersion": 2},
        {"id": "Bad_ID"},
        {"name": ""},
        {"files": "report.json"},
        {"assets": [{"name": "logo.png"}]},
    ],
)
def test_manifest_out_of_schema(change):
    assert code_of(raw_zip(good_entries({**manifest(), **change}))) == "INPUT_INVALID"


def test_manifest_that_is_not_json():
    entries = good_entries()
    entries[0] = (MANIFEST, "{ broken")
    assert code_of(raw_zip(entries)) == "INPUT_INVALID"


def test_asset_sha256_must_match_the_manifest():
    entries = good_entries()
    entries[3] = ("logo.png", PNG + b"x")
    assert code_of(raw_zip(entries)) == "INPUT_INVALID"


def test_manifest_tags_are_read_and_normalised():
    m = manifest(tags=[" vip ", "ไตรมาส  4", "vip"])
    assert read_zip(raw_zip(good_entries(m))).tags == ["vip", "ไตรมาส 4"]


def test_a_zip_without_tags_is_an_older_zip_and_imports_with_none():
    assert "tags" not in manifest()
    assert read_zip(raw_zip(good_entries())).tags == []


@pytest.mark.parametrize("bad", ["vip", [3], ["a,b"], [f"t{i}" for i in range(11)]])
def test_bad_manifest_tags_are_input_invalid(bad):
    assert code_of(raw_zip(good_entries(manifest(tags=bad)))) == "INPUT_INVALID"
