import respx

from .conftest import API


async def test_healthz_follows_the_api(http):
    with respx.mock(base_url=API, assert_all_called=False) as mock:
        mock.get("/v1/health").respond(200, json={"status": "up"})
        ok = await http.get("/healthz")
    assert (ok.status_code, ok.json()) == (200, {"status": "ok"})
    with respx.mock(base_url=API, assert_all_called=False) as mock:
        mock.get("/v1/health").respond(503, json={"status": "down"})
        down = await http.get("/healthz")
    assert down.status_code == 503
