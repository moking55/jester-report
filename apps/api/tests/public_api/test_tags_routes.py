import pytest

from .test_contract import assert_fits

pytestmark = pytest.mark.db


async def test_tags_list_counts_and_colours(api, admin):
    for tid, tags in (("aa", ["vip", "q4"]), ("bb", ["vip"])):
        await api.post("/v1/templates", headers=admin, json={"id": tid, "name": tid})
        await api.put(f"/v1/templates/{tid}/tags", headers=admin, json={"tags": tags})
    listed = await api.get("/v1/tags", headers=admin)
    assert listed.status_code == 200
    assert listed.json() == [
        {"tag": "vip", "color": "gray", "templates": 2, "documents": 0},
        {"tag": "q4", "color": "gray", "templates": 1, "documents": 0},
    ]
    for item in listed.json():
        assert_fits("TagUse", item)
    put = await api.put("/v1/tag-colors", headers=admin, json={"tag": " vip ", "color": "red"})
    assert (put.status_code, put.json()) == (200, {"tag": "vip", "color": "red"})
    assert (await api.get("/v1/tags", headers=admin)).json()[0]["color"] == "red"
    await api.put("/v1/tag-colors", headers=admin, json={"tag": "vip", "color": "gray"})
    assert (await api.get("/v1/tags", headers=admin)).json()[0]["color"] == "gray"
    assert (await api.get("/v1/tags")).status_code == 401


async def test_tag_color_errors_and_who_may_set_it(api, admin):
    for body in (
        {"tag": "vip", "color": "#ff0000"},
        {"tag": "vip", "color": "RED"},
        {"tag": "a,b", "color": "red"},
        {"tag": "", "color": "red"},
        {"tag": "vip"},
        {"color": "red"},
        {"tag": "vip", "color": "red", "x": 1},
    ):
        assert (await api.put("/v1/tag-colors", headers=admin, json=body)).status_code == 422, body
    ok = await api.put("/v1/tag-colors", headers=admin, json={"tag": "unused", "color": "teal"})
    assert ok.status_code == 200  # nobody uses it yet; it is still coloured
    assert (await api.put("/v1/tag-colors", json={"tag": "v", "color": "red"})).status_code == 401
    key = await api.post("/v1/api-keys", headers=admin, json={"name": "erp"})
    by_key = {"Authorization": f"Bearer {key.json()['secret']}"}
    refused = await api.put("/v1/tag-colors", headers=by_key, json={"tag": "v", "color": "red"})
    assert refused.status_code == 401
    assert (await api.get("/v1/tags", headers=by_key)).status_code == 401
