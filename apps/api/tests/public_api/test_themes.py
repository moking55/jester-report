import pytest
from psycopg.types.json import Jsonb

from jester_api.themes import BUILTIN

from .test_contract import assert_fits

pytestmark = pytest.mark.db
SURIYAN = BUILTIN["suriyan"]["tokens"]


async def test_default_theme_is_public_and_starts_as_classic(api):
    response = await api.get("/v1/themes/default")
    assert response.status_code == 200
    assert response.json()["id"] == "classic" and response.json()["builtIn"] is True


async def test_theme_lifecycle(api, admin):
    listed = await api.get("/v1/themes", headers=admin)
    assert [t["id"] for t in listed.json()] == ["classic", "suriyan"]
    for t in listed.json():
        assert_fits("Theme", t)

    created = await api.post(
        "/v1/themes", headers=admin, json={"name": "แบรนด์", "tokens": {**SURIYAN, "color.primary": "#2457C5"}}
    )
    assert created.status_code == 201, created.text
    theme = created.json()
    assert_fits("Theme", theme)
    assert theme["builtIn"] is False and theme["createdBy"] == "alice"

    again = await api.post("/v1/themes", headers=admin, json={"name": "แบรนด์", "tokens": SURIYAN})
    assert again.status_code == 409

    updated = await api.put(
        f"/v1/themes/{theme['id']}", headers=admin, json={"name": "แบรนด์ใหม่", "tokens": SURIYAN}
    )
    assert updated.status_code == 200 and updated.json()["name"] == "แบรนด์ใหม่"

    made_default = await api.put("/v1/themes/default", headers=admin, json={"themeId": theme["id"]})
    assert made_default.status_code == 200
    assert (await api.get("/v1/themes/default")).json()["id"] == theme["id"]

    assert (await api.delete(f"/v1/themes/{theme['id']}", headers=admin)).status_code == 204
    assert (await api.get("/v1/themes/default")).json()["id"] == "classic"  # fell back
    assert (await api.delete(f"/v1/themes/{theme['id']}", headers=admin)).status_code == 404


async def test_built_in_themes_cannot_change(api, admin):
    assert (
        await api.put("/v1/themes/suriyan", headers=admin, json={"name": "x", "tokens": SURIYAN})
    ).status_code == 409
    assert (await api.delete("/v1/themes/classic", headers=admin)).status_code == 409
    taken = await api.post("/v1/themes", headers=admin, json={"name": "suriyan", "tokens": SURIYAN})
    assert taken.status_code == 409


async def test_css_in_a_token_is_422_with_a_pointer(api, admin):
    response = await api.post(
        "/v1/themes",
        headers=admin,
        json={"name": "แฝง", "tokens": {**SURIYAN, "color.primary": "red;}body{display:none", "x": 1}},
    )
    assert response.status_code == 422
    assert sorted(p["pointer"] for p in response.json()["problems"]) == ["/tokens/color.primary", "/tokens/x"]


async def test_theme_routes_need_a_session_and_ids_must_exist(api, admin):
    assert (await api.get("/v1/themes")).status_code == 401
    assert (await api.put("/v1/themes/default", json={"themeId": "classic"})).status_code == 401
    assert (await api.put("/v1/themes/default", headers=admin, json={"themeId": "nope"})).status_code == 404
    assert (
        await api.put("/v1/themes/not-a-uuid", headers=admin, json={"name": "x", "tokens": SURIYAN})
    ).status_code == 404


async def test_at_most_fifty_themes(api, admin, pool):
    # 49 rows straight into the table (50 API calls are slow over a remote test database), then the API
    async with pool.connection() as conn:
        await conn.execute(
            "INSERT INTO themes (id, name, tokens, updated_at) "
            "SELECT gen_random_uuid(), 'bulk' || n, %s, now() FROM generate_series(1, 49) AS n",
            (Jsonb(SURIYAN),),
        )
    fiftieth = await api.post("/v1/themes", headers=admin, json={"name": "t50", "tokens": SURIYAN})
    assert fiftieth.status_code == 201
    one_more = await api.post("/v1/themes", headers=admin, json={"name": "t51", "tokens": SURIYAN})
    assert one_more.status_code == 409
