// v1.15: the template a Word form converts to (api golden file) opens in the Designer as blocks.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { allBlocks, readBlocks } from "@/lib/doc-blocks";

const GOLDEN = join(__dirname, "../../api/tests/template_store/fixtures/docx/form.template.html");

describe("a converted Word form in the Designer", () => {
  it("is blocks, except the table with a vertical merge (rowspan)", () => {
    const src = readFileSync(GOLDEN, "utf8");
    const blocks = allBlocks(readBlocks(src)).filter((b) => b.render);
    const custom = blocks.filter((b) => b.kind === "custom");
    expect(custom).toHaveLength(1);
    expect(src.slice(custom[0].start, custom[0].end)).toContain('rowspan="2"');
    expect(blocks.map((b) => b.kind)).toEqual(
      expect.arrayContaining(["text", "space", "grid", "custom"]),
    );
    const grid = blocks.find((b) => b.kind === "grid")!;
    expect(grid.detail.kind === "grid" && grid.detail.cols).toBe(5);
    expect(grid.detail.kind === "grid" && grid.detail.head).toBe(true);
  });
});
