from .health import router as health
from .setup_auth import router as setup_auth
from .templates import router as templates
from .users_keys import router as users_keys

ROUTERS = [health, setup_auth, users_keys, templates]
