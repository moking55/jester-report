from .health import router as health
from .setup_auth import router as setup_auth
from .users_keys import router as users_keys

ROUTERS = [health, setup_auth, users_keys]
