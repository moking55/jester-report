"""The page /authorize sends the browser to: sign in with a Jester account (SPEC-mcp.md assumption 3).

The username and password go to the api's own login (`lifetime: long`, with the Studio key so the api
accepts it and trusts the browser's IP for its rate limit). They are never stored or logged here.
The random `request` id from /authorize ties the form to one pending authorization.
"""
# ruff: noqa: E501  (the page below is HTML/CSS, kept as written)

from __future__ import annotations

import html
import logging

import httpx
from starlette.requests import Request
from starlette.responses import HTMLResponse, RedirectResponse, Response

from .api import Api, ApiProblem
from .oauth import Provider
from .settings import Settings

log = logging.getLogger("jester_mcp.login")
HEADERS = {
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
}
PAGE = """<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>เข้าสู่ระบบ Jester</title>
<style>
body{{font-family:system-ui,"Sarabun",sans-serif;background:#f5f5f4;color:#1c1917;margin:0;padding:16px}}
main{{max-width:380px;margin:12vh auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 3px #0002}}
h1{{font-size:1.3rem;margin:0 0 6px}} p{{color:#57534e;margin:0 0 18px;line-height:1.5}}
label{{display:block;font-size:.9rem;margin:12px 0 4px}}
input{{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d6d3d1;border-radius:8px;font:inherit}}
.err{{background:#fef2f2;color:#991b1b;padding:10px;border-radius:8px;margin-bottom:12px}}
.row{{display:flex;gap:8px;margin-top:20px}} button{{flex:1;padding:10px;border-radius:8px;font:inherit;cursor:pointer}}
.go{{background:#1c1917;color:#fff;border:0}} .no{{background:#fff;border:1px solid #d6d3d1}}
@media (prefers-color-scheme:dark){{body{{background:#1c1917;color:#f5f5f4}}main{{background:#292524}}
p{{color:#a8a29e}}input,.no{{background:#1c1917;color:#f5f5f4;border-color:#57534e}}.go{{background:#f5f5f4;color:#1c1917}}}}
</style></head><body><main>
<h1>เชื่อมต่อ Claude กับ Jester</h1>
<p>เข้าสู่ระบบด้วยบัญชี Jester ของคุณ Claude จะสร้างและแก้ draft ของรายงานได้ แต่ publish ไม่ได้</p>
{error}
<form method="post" action="/login">
<input type="hidden" name="request" value="{request}">
<label for="u">ชื่อผู้ใช้</label><input id="u" name="username" autocomplete="username" required value="{username}">
<label for="p">รหัสผ่าน</label><input id="p" name="password" type="password" autocomplete="current-password" required>
<div class="row"><button class="no" name="action" value="cancel" formnovalidate>ยกเลิก</button>
<button class="go" name="action" value="login">เข้าสู่ระบบ</button></div>
</form></main></body></html>"""
GONE = (
    '<!doctype html><html lang="th"><meta charset="utf-8"><title>หมดเวลา</title>'
    "<p>หน้านี้หมดเวลาแล้ว กลับไปที่ Claude แล้วกดเชื่อมต่อ Jester ใหม่อีกครั้ง</p></html>"
)


def _page(request_id: str, username: str = "", error: str = "", status: int = 200) -> HTMLResponse:
    body = PAGE.format(
        request=html.escape(request_id),
        username=html.escape(username),
        error=f'<div class="err" role="alert">{html.escape(error)}</div>' if error else "",
    )
    return HTMLResponse(body, status_code=status, headers=HEADERS)


def _browser_ip(request: Request, header: str | None) -> str | None:
    """The last hop our proxy added (earlier entries of X-Forwarded-For can be forged by the browser)."""
    if not header:
        return None
    value = request.headers.get(header, "")
    ip = value.split(",")[-1].strip()
    return ip or None


def routes(settings: Settings, api: Api, provider: Provider):
    async def show(request: Request) -> Response:
        request_id = request.query_params.get("request", "")
        if provider.login_request(request_id) is None:
            return HTMLResponse(GONE, status_code=400, headers=HEADERS)
        return _page(request_id)

    async def submit(request: Request) -> Response:
        form = await request.form()
        request_id = str(form.get("request", ""))
        if provider.login_request(request_id) is None:
            return HTMLResponse(GONE, status_code=400, headers=HEADERS)
        if form.get("action") == "cancel":
            return RedirectResponse(provider.cancel_login(request_id) or "/", status_code=303)
        username = str(form.get("username", ""))[:100]
        password = str(form.get("password", ""))[:200]
        headers = {"X-Jester-Studio-Key": settings.studio_key}
        ip = _browser_ip(request, settings.client_ip_header)
        if ip:
            headers["X-Jester-Client-IP"] = ip
        try:
            response = await api.call(
                "POST",
                "/v1/auth/login",
                None,
                headers=headers,
                json={"username": username, "password": password, "lifetime": "long"},
            )
        except ApiProblem as e:
            if e.status == 401:
                return _page(request_id, username, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", 401)
            if e.status == 429:
                return _page(request_id, username, "ลองผิดหลายครั้งเกินไป รอสักครู่แล้วลองใหม่", 429)
            log.error("api login failed: %s %s", e.status, e.code)  # 422 here = JESTER_STUDIO_KEY differs
            return _page(request_id, username, "เข้าสู่ระบบไม่ได้ในตอนนี้ แจ้งผู้ดูแล Jester", 502)
        except httpx.HTTPError:
            log.error("api unreachable during login")
            return _page(request_id, username, "เข้าสู่ระบบไม่ได้ในตอนนี้ แจ้งผู้ดูแล Jester", 502)
        session = response.json()
        redirect = provider.complete_login(request_id, session["token"], session["user"]["username"])
        return RedirectResponse(redirect, status_code=303)

    return show, submit
