import httpx
import pytest
import respx

from jester_mcp.api import ApiProblem, NotAllowed, SessionExpired, allowed, path
from jester_mcp.settings import CLAUDE_CALLBACKS, SettingsError, from_env

from .conftest import API


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("GET", "/v1/templates"),
        ("GET", "/v1/templates/quotation/draft"),
        ("PUT", "/v1/templates/quotation/draft/files/template.html"),
        ("POST", "/v1/templates/quotation/draft/preview"),
        ("POST", "/v1/auth/login"),
    ],
)
def test_allowed(method, url):
    assert allowed(method, url)


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("POST", "/v1/templates/quotation/versions"),  # publish
        ("PUT", "/v1/templates/quotation/published"),  # alias
        ("PUT", "/v1/templates/quotation/archived"),
        ("POST", "/v1/templates/quotation/draft/reset"),
        ("GET", "/v1/users"),
        ("DELETE", "/v1/users/x"),
        ("POST", "/v1/api-keys"),
        ("PUT", "/v1/runs/retention"),
        ("POST", "/v1/render"),
        ("DELETE", "/v1/templates/quotation"),
        ("GET", "/v1/templates/quotation/draft/files/a/b"),
    ],
)
def test_refused(method, url):
    assert not allowed(method, url)


def test_path_encodes_segments():
    assert path("v1", "templates", "a b?#", "draft") == "/v1/templates/a%20b%3F%23/draft"
    for bad in ("..", ".", "", "x/../../users", "a\\b"):
        with pytest.raises(ValueError):
            path("v1", "templates", bad, "draft")


async def test_refused_call_sends_nothing(api):
    with respx.mock(base_url=API, assert_all_called=False) as mock:
        route = mock.post("/v1/templates/q/versions").respond(201)
        with pytest.raises(NotAllowed):
            await api.call("POST", "/v1/templates/q/versions", "jrs_x")
        assert not route.called


async def test_session_goes_in_the_bearer_header(api):
    with respx.mock(base_url=API) as mock:
        route = mock.get("/v1/auth/me").respond(200, json={"username": "alice"})
        response = await api.call("GET", "/v1/auth/me", "jrs_abc")
    assert response.json() == {"username": "alice"}
    assert route.calls.last.request.headers["Authorization"] == "Bearer jrs_abc"


async def test_problems_come_back_as_the_api_said(api):
    problem = {
        "code": "DRAFT_INVALID",
        "detail": "the draft has problems",
        "problems": [{"file": "report.json", "message": "x"}],
        "runId": "run_1",
    }
    with respx.mock(base_url=API) as mock:
        mock.post("/v1/templates/q/draft/validate").respond(422, json=problem)
        mock.put("/v1/templates/q/draft/files/a.html").respond(
            412, json={"code": "REVISION_CONFLICT", "detail": "d"}
        )
        mock.get("/v1/auth/me").respond(401, json={"code": "UNAUTHORIZED", "detail": "expired"})
        mock.get("/v1/templates/q").respond(502, text="bad gateway")
        with pytest.raises(ApiProblem) as e:
            await api.call("POST", "/v1/templates/q/draft/validate", "s")
        assert e.value.as_dict() == {"status": 422, **problem}
        with pytest.raises(ApiProblem) as e:
            await api.call("PUT", "/v1/templates/q/draft/files/a.html", "s", content="x")
        assert (e.value.status, e.value.code) == (412, "REVISION_CONFLICT")
        with pytest.raises(SessionExpired):
            await api.call("GET", "/v1/auth/me", "s")
        with pytest.raises(ApiProblem) as e:
            await api.call("GET", "/v1/templates/q", "s")
        assert (e.value.status, e.value.code) == (502, "HTTP_502")


async def test_health(api):
    with respx.mock(base_url=API) as mock:
        mock.get("/v1/health").respond(200, json={"status": "up"})
        assert await api.health()
    with respx.mock(base_url=API) as mock:
        mock.get("/v1/health").respond(503, json={"status": "down"})
        assert not await api.health()
    with respx.mock(base_url=API) as mock:
        mock.get("/v1/health").mock(side_effect=httpx.ConnectError("no route"))
        assert not await api.health()


def test_settings_from_env():
    env = {
        "JESTER_API_URL": "http://api:8000/",
        "JESTER_MCP_PUBLIC_URL": "https://mcp.example.com",
        "JESTER_STUDIO_PUBLIC_URL": "https://jester.example.com",
        "JESTER_STUDIO_KEY": "secret-value",
    }
    s = from_env(env)
    assert (s.api_url, s.resource_url, s.redirect_allow, s.client_ip_header) == (
        "http://api:8000",
        "https://mcp.example.com/mcp",
        CLAUDE_CALLBACKS,
        None,
    )
    s = from_env(
        {
            **env,
            "JESTER_MCP_REDIRECT_ALLOW": "http://localhost:6274/oauth/callback, x",
            "JESTER_MCP_CLIENT_IP_HEADER": "X-Forwarded-For",
        }
    )
    assert s.redirect_allow == ("http://localhost:6274/oauth/callback", "x")
    assert s.client_ip_header == "X-Forwarded-For"
    with pytest.raises(SettingsError) as e:
        from_env({**env, "JESTER_STUDIO_KEY": " "})
    assert "JESTER_STUDIO_KEY" in str(e.value) and "secret-value" not in str(e.value)
