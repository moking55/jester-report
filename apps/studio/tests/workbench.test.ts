import { describe, expect, it } from "vitest";

import { readBlocks } from "@/lib/doc-blocks";
import { modelIndex } from "@/components/designer/Workbench";

// a {% set %} and a comment draw nothing on the paper but still hold places in the file
const SRC = `<p>a</p>
{% set x = 1 %}
<p>b</p>
{# note #}
<p>c</p>
`;

describe("modelIndex", () => {
  const root = readBlocks(SRC);
  const shown = root.items.filter((b) => b.render);

  it("maps a drawn index to the file index, skipping hidden blocks", () => {
    expect(shown.length).toBe(3);
    expect(modelIndex(root, 0, null)).toBe(0);
    expect(modelIndex(root, 1, null)).toBe(2); // before <p>b</p>, after the set
    expect(modelIndex(root, 2, null)).toBe(4);
    expect(modelIndex(root, 3, null)).toBe(5); // after the last drawn block
  });

  it("puts a block dropped at the end after hidden blocks there (a variable set last is set before it)", () => {
    const tail = readBlocks(`<p>a</p>
{% set v = 1 %}
`);
    expect(modelIndex(tail, 1, null)).toBe(2);
  });

  it("counts without the block being moved", () => {
    const a = shown[0];
    // others = set, b, note, c; dropping before c (drawn index 1 among b, c)
    expect(modelIndex(root, 1, a)).toBe(3);
    expect(modelIndex(root, 2, a)).toBe(4);
  });
});
