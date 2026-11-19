"""Paper sizes in millimetres (SPEC-report-definition.md v1.8); Studio lib/paper.ts has the same numbers."""

from __future__ import annotations

from decimal import Decimal

# portrait width x height
PAPER_MM: dict[str, tuple[Decimal, Decimal]] = {
    "A3": (Decimal(297), Decimal(420)),
    "A4": (Decimal(210), Decimal(297)),
    "A5": (Decimal(148), Decimal(210)),
    "A6": (Decimal(105), Decimal(148)),
    "B5": (Decimal(176), Decimal(250)),
    "Letter": (Decimal("215.9"), Decimal("279.4")),
    "Legal": (Decimal("215.9"), Decimal("355.6")),
    "DL": (Decimal(110), Decimal(220)),
}
SIZES = (*PAPER_MM, "custom", "roll")

CUSTOM_WIDTH = (Decimal(25), Decimal(1000))
CUSTOM_HEIGHT = (Decimal(25), Decimal(2000))
ROLL_WIDTHS = (58, 80)
ROLL_BASE_HEIGHT_MM = Decimal(1000)  # sent as paperHeight; singlePage makes the PDF as tall as the content
ROLL_MARGINS = {"top": Decimal(3), "bottom": Decimal(3), "left": Decimal(2), "right": Decimal(2)}
MIN_CONTENT_MM = Decimal(20)
