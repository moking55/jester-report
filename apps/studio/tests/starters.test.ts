import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { allBlocks, readBlocks } from "@/lib/doc-blocks";

// SPEC-template-store.md "v1.7 G4": the starters are written so the Document Designer reads them as blocks.
// Custom Code is left only where the model has no block: sales-grouped's group-by table, tax-invoice's macro.

const STARTERS = join(__dirname, "../../api/src/jester_api/template_store/starters");
const read = (name: string) => readFileSync(join(STARTERS, name, "template.html"), "utf8").replace(/\r\n/g, "\n");

const customs = (name: string) =>
  allBlocks(readBlocks(read(name)))
    .filter((b) => b.kind === "custom")
    .map((b) => read(name).slice(b.start, b.end).split("\n")[0].trim());

describe("starters read as designer blocks", () => {
  it.each(["blank", "quotation", "purchase-order"])("%s has no Custom Code", (name) => {
    expect(customs(name)).toEqual([]);
  });

  it("sales-grouped: only the group-by table", () => {
    expect(customs("sales-grouped")).toEqual(["<table>"]);
  });

  it("tax-invoice: only the branch() macro (it draws nothing)", () => {
    const blocks = allBlocks(readBlocks(read("tax-invoice")));
    expect(blocks.filter((b) => b.kind === "custom" && b.render)).toEqual([]);
    expect(blocks.filter((b) => b.kind === "row").length).toBe(5); // head, meta, foot, pay, sign
    expect(blocks.some((b) => b.kind === "summary")).toBe(true);
  });
});
