from .health import router as health
from .render import router as render
from .runs import router as runs
from .setup_auth import router as setup_auth
from .templates import router as templates
from .themes import router as themes
from .users_keys import router as users_keys

ROUTERS = [health, setup_auth, users_keys, templates, render, runs, themes]
