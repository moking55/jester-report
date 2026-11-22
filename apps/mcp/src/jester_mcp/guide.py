"""The authoring guide the model reads through `get_authoring_guide` (SPEC-mcp.md assumption 6).

overview/format/sources are copies of the to-jester skill, made at build time (never edited by hand):
    python -m jester_mcp.guide ../../.claude/skills/to-jester
`mcp` is this package's own page: how to do the skill's work through the connector instead of a zip.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
COPIES = HERE / "guide"  # gitignored; filled by copy_from()
SKILL_FILES = {
    "overview": "SKILL.md",
    "format": "references/format.md",
    "sources": "references/sources.md",
}
TOPICS = ("mcp", *SKILL_FILES)


def copy_from(skill_dir: str | Path) -> None:
    skill = Path(skill_dir)
    COPIES.mkdir(exist_ok=True)
    for topic, name in SKILL_FILES.items():
        shutil.copyfile(skill / name, COPIES / f"{topic}.md")


def read(topic: str) -> str:
    if topic == "mcp":
        return (HERE / "guide_mcp.md").read_text(encoding="utf-8")
    if topic not in SKILL_FILES:
        raise KeyError(topic)
    copy = COPIES / f"{topic}.md"
    if not copy.exists():
        raise FileNotFoundError(f"guide '{topic}' was not copied at build time (python -m jester_mcp.guide)")
    return copy.read_text(encoding="utf-8")


if __name__ == "__main__":
    copy_from(sys.argv[1])
    print(f"copied {', '.join(SKILL_FILES)} into {COPIES}")
