"""What routes reach through `request.app.state`: the settings and the module services."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Request

from ..auth import Auth
from ..render_service import RenderService
from ..template_store import TemplateStore
from ..themes import Themes
from .settings import Settings


@dataclass
class Services:
    auth: Auth
    store: TemplateStore
    render: RenderService
    themes: Themes
    closers: tuple[Any, ...] = ()  # pool, engine client: closed at shutdown when the app built them


def services(request: Request) -> Services:
    return request.app.state.services


def settings(request: Request) -> Settings:
    return request.app.state.settings
