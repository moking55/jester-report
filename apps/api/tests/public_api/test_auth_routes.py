import pytest

from .conftest import PASSWORD, STUDIO_KEY

pytestmark = pytest.mark.db


async def test_setup_flow(api):
    assert (await api.get("/v1/setup")).json() == {"setupRequired": True}
    services = api._transport.app.state.services
    token = await services.auth.prepare_setup()
    wrong = await api.post(
        "/v1/setup", json={"setupToken": "x" * 32, "username": "alice", "password": PASSWORD}
    )
    assert (wrong.status_code, wrong.json()["code"]) == (403, "SETUP_TOKEN_INVALID")
    ok = await api.post("/v1/setup", json={"setupToken": token, "username": "alice", "password": PASSWORD})
    assert (
        ok.status_code == 201
        and ok.json()["token"].startswith("jrs_")
        and ok.json()["user"]["username"] == "alice"
    )
    again = await api.post("/v1/setup", json={"setupToken": token, "username": "bob", "password": PASSWORD})
    assert (again.status_code, again.json()["code"]) == (409, "SETUP_COMPLETED")
    extra = await api.post(
        "/v1/setup", json={"setupToken": token, "username": "x", "password": PASSWORD, "admin": 1}
    )
    assert extra.status_code == 422  # unknown fields are rejected


async def test_login_me_logout_password(api, admin):
    me = await api.get("/v1/auth/me", headers=admin)
    assert me.json()["username"] == "alice"
    login = await api.post("/v1/auth/login", json={"username": "alice", "password": PASSWORD})
    headers = {"Authorization": f"Bearer {login.json()['token']}"}
    changed = await api.put(
        "/v1/auth/password",
        headers=headers,
        json={"currentPassword": PASSWORD, "newPassword": "a new passphrase"},
    )
    assert changed.status_code == 204
    assert (await api.get("/v1/auth/me", headers=admin)).status_code == 401  # other sessions revoked
    assert (await api.post("/v1/auth/logout", headers=headers)).status_code == 204
    assert (await api.get("/v1/auth/me", headers=headers)).status_code == 401


async def test_login_rate_limit_uses_the_studio_ip_only_with_the_key(api, admin):
    def attempt(headers):
        return api.post(
            "/v1/auth/login", headers=headers, json={"username": "alice", "password": "wrong pass 123"}
        )

    studio = {"X-Jester-Studio-Key": STUDIO_KEY, "X-Jester-Client-IP": "203.0.113.50"}
    for _ in range(5):
        assert (await attempt(studio)).status_code == 401
    assert (await attempt(studio)).status_code == 429
    # a forged IP without the key does not escape: it counts against the connection's IP
    forged = {"X-Jester-Client-IP": "203.0.113.51"}
    for _ in range(5):
        await attempt(forged)
    assert (await attempt({"X-Jester-Client-IP": "203.0.113.52"})).status_code == 429
    # the owner from another browser IP (through Studio) is not locked out
    elsewhere = {"X-Jester-Studio-Key": STUDIO_KEY, "X-Jester-Client-IP": "192.0.2.10"}
    ok = await api.post("/v1/auth/login", headers=elsewhere, json={"username": "alice", "password": PASSWORD})
    assert ok.status_code == 200


async def test_users_and_api_keys(api, admin):
    bob = await api.post("/v1/users", headers=admin, json={"username": "bob", "password": PASSWORD})
    assert bob.status_code == 201
    dup = await api.post("/v1/users", headers=admin, json={"username": "BOB", "password": PASSWORD})
    assert (dup.status_code, dup.json()["code"]) == (409, "CONFLICT")
    assert [u["username"] for u in (await api.get("/v1/users", headers=admin)).json()] == ["alice", "bob"]

    key = await api.post("/v1/api-keys", headers=admin, json={"name": "erp"})
    assert (
        key.status_code == 201
        and key.json()["secret"].startswith("jrk_")
        and key.json()["createdBy"] == "alice"
    )
    listed = (await api.get("/v1/api-keys", headers=admin)).json()
    assert "secret" not in listed[0]
    key_auth = {"Authorization": f"Bearer {key.json()['secret']}"}
    assert (await api.get("/v1/users", headers=key_auth)).status_code == 401  # API keys: render only
    assert (await api.delete(f"/v1/api-keys/{key.json()['id']}", headers=admin)).status_code == 204

    assert (await api.delete(f"/v1/users/{bob.json()['id']}", headers=admin)).status_code == 204
    me = (await api.get("/v1/auth/me", headers=admin)).json()
    last = await api.delete(f"/v1/users/{me['id']}", headers=admin)
    assert (last.status_code, last.json()["code"]) == (409, "CONFLICT")
    assert (await api.delete("/v1/users/not-a-uuid", headers=admin)).status_code == 422


async def test_set_another_users_password(api, admin):
    bob = (await api.post("/v1/users", headers=admin, json={"username": "bob", "password": PASSWORD})).json()
    login = await api.post("/v1/auth/login", json={"username": "bob", "password": PASSWORD})
    old = {"Authorization": f"Bearer {login.json()['token']}"}
    url = f"/v1/users/{bob['id']}/password"
    new = {"newPassword": "a brand new password"}
    assert (await api.put(url, headers=admin, json=new)).status_code == 204
    assert (await api.get("/v1/auth/me", headers=old)).status_code == 401
    again = await api.post("/v1/auth/login", json={"username": "bob", "password": "a brand new password"})
    assert again.status_code == 200
    me = (await api.get("/v1/auth/me", headers=admin)).json()
    own = await api.put(f"/v1/users/{me['id']}/password", headers=admin, json={"newPassword": PASSWORD})
    assert own.status_code == 422
    key = (await api.post("/v1/api-keys", headers=admin, json={"name": "erp"})).json()["secret"]
    by_key = await api.put(url, headers={"Authorization": f"Bearer {key}"}, json={"newPassword": PASSWORD})
    assert by_key.status_code == 401
