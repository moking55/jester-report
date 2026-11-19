"""Draft limits and name patterns, shared by the store and the zip bundle (SPEC-template-store.md)."""

import re

MAX_TEXT_BYTES = 1024 * 1024
MAX_ASSET_BYTES = 5 * 1024 * 1024
MAX_DRAFT_BYTES = 20 * 1024 * 1024  # the engine's request limit
MAX_FILES = 50
REQUIRED_FILES = ("report.json", "template.html")

# patterns from public-api.yaml (TemplateId, TextFileName, AssetName)
TEMPLATE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
TEXT_FILE = re.compile(r"^(?!index\.html$)[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(html|json|css)$")
ASSET_FILE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(png|jpe?g|gif|svg|webp|avif|bmp|ttf|otf)$")
