from pathlib import Path

import pytest
from mcp.server.mcpserver.exceptions import ToolError

from jester_mcp import guide

SKILL = Path(__file__).resolve().parents[3] / ".claude" / "skills" / "to-jester"


@pytest.fixture(scope="module", autouse=True)
def copied():
    guide.copy_from(SKILL)  # what the Docker build does


def test_copies_are_the_skill_byte_for_byte():
    for topic, name in guide.SKILL_FILES.items():
        assert (guide.COPIES / f"{topic}.md").read_bytes() == (SKILL / name).read_bytes(), topic


async def test_tool_serves_every_topic(signed_in):
    for topic in guide.TOPICS:
        result = await signed_in.call_tool("get_authoring_guide", {"topic": topic})
        assert not result.is_error and result.structured_content["content"].strip(), topic
    mcp_page = (await signed_in.call_tool("get_authoring_guide", {})).structured_content
    assert mcp_page["topic"] == "mcp" and "put_draft_file" in mcp_page["content"]
    assert "studioUrl" in mcp_page["content"]


async def test_unknown_topic_lists_the_topics(signed_in):
    with pytest.raises(ToolError, match="overview"):
        await signed_in.call_tool("get_authoring_guide", {"topic": "secrets"})


async def test_instructions_point_at_the_guide(signed_in):
    assert "get_authoring_guide('mcp')" in signed_in.instructions
    assert "cannot publish" in signed_in.instructions
