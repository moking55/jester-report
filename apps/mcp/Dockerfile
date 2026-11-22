# Jester MCP connector. The to-jester skill comes in as a named build context (compose sets it):
#   docker build --build-context skill=.claude/skills/to-jester -t jester/mcp apps/mcp
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
RUN uv sync --frozen --no-dev

# the authoring guide the model reads (get_authoring_guide): copied from the skill, never edited here
COPY --from=skill SKILL.md /tmp/skill/SKILL.md
COPY --from=skill references /tmp/skill/references
RUN python -m jester_mcp.guide /tmp/skill && rm -rf /tmp/skill

RUN useradd --system --uid 10001 --no-create-home jester \
    && mkdir /data && chown jester /data
USER jester
VOLUME /data

EXPOSE 8100
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/.well-known/oauth-authorization-server', timeout=4)" || exit 1
CMD ["jester-mcp"]
