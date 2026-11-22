"""The connector only uses operations that exist in the api contract, and never the ones that publish."""

import re
from pathlib import Path

import yaml

from jester_mcp.api import ALLOWED

CONTRACT = Path(__file__).resolve().parents[2] / "api" / "openapi" / "public-api.yaml"
NEVER = {
    "publishDraft",
    "setPublishedVersion",
    "resetDraftFromVersion",
    "setTemplateArchived",
    "render",
    "createUser",
    "deleteUser",
    "setUserPassword",
    "createApiKey",
    "revokeApiKey",
    "setRunRetention",
    "importTemplate",
}
TOOLS = {
    "whoami",
    "list_templates",
    "get_template",
    "get_draft",
    "list_versions",
    "validate_draft",
    "prepare_draft",
}


def contract_operations() -> dict[tuple[str, str], str]:
    paths = yaml.safe_load(CONTRACT.read_text(encoding="utf-8"))["paths"]
    return {
        (method.upper(), path): op["operationId"]
        for path, ops in paths.items()
        for method, op in ops.items()
        if isinstance(op, dict) and "operationId" in op
    }


def test_every_allowed_call_is_in_the_contract_and_none_publishes():
    ops = contract_operations()
    used = set()
    for method, pattern in ALLOWED:
        matches = [
            op for (m, p), op in ops.items() if m == method and pattern.match(re.sub(r"\{[^}]+\}", "x", p))
        ]
        assert len(matches) == 1, (method, pattern.pattern, matches)
        used.add(matches[0])
    assert not used & NEVER, used & NEVER
    assert len(used) == len(ALLOWED)


async def test_tool_list_is_exactly_the_draft_authoring_set(signed_in):
    assert {t.name for t in await signed_in.list_tools()} == TOOLS
