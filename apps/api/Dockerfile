# Jester API (FastAPI). Build from apps/api:  docker build -t jester/api apps/api
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.8 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

WORKDIR /app

# dependencies first, so code changes do not reinstall them
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
# the contract is served at /v1/openapi.yaml; settings.py finds it next to src/
COPY openapi ./openapi
RUN uv sync --frozen --no-dev

RUN useradd --system --uid 10001 --no-create-home jester
USER jester

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD python -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:8000/v1/openapi.yaml', timeout=4)" || exit 1
CMD ["python", "-m", "jester_api.public_api"]
