import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { BlockPanel } from "@/components/designer/BlockPanels";
import { readBlocks } from "@/lib/doc-blocks";
import type { Edited, Result } from "@/lib/doc-edit";

afterEach(cleanup);

function Harness({ start, onSrc }: { start: string; onSrc: (src: string) => void }) {
  const [src, setSrc] = useState(start);
  const apply = (r: Result<Edited> | Edited) => {
    const e = "ok" in r ? (r.ok ? r.value : null) : r;
    if (e) {
      setSrc(e.src);
      onSrc(e.src);
    }
  };
  return <BlockPanel block={readBlocks(src).items[0]} src={src} files={{}} assets={[]} readOnly={false} fields={[]} apply={apply} onCode={() => undefined} />;
}

describe("branch buttons in the panel", () => {
  it("a condition gets an elif and an else, and the else can go again", () => {
    let src = "";
    render(<Harness start="{% if a %}<p>x</p>{% endif %}" onSrc={(s) => (src = s)} />);
    fireEvent.click(screen.getByRole("button", { name: "+ ไม่เช่นนั้นถ้า" }));
    expect(src).toContain("{% elif true %}");
    fireEvent.click(screen.getByRole("button", { name: "+ ไม่เช่นนั้น" }));
    expect(src).toContain("{% else %}");
    fireEvent.click(screen.getByRole("button", { name: "เอา ไม่เช่นนั้น ออก" }));
    expect(src).not.toContain("{% else %}");
  });

  it("a loop gets its else (no rows)", () => {
    let src = "";
    render(<Harness start="{% for r in lists.a %}<p>x</p>{% endfor %}" onSrc={(s) => (src = s)} />);
    fireEvent.click(screen.getByRole("button", { name: "+ ถ้าไม่มีแถว" }));
    expect(src).toContain("{% else %}");
    expect(screen.getByRole("button", { name: "เอา ถ้าไม่มีแถว ออก" })).toBeTruthy();
  });
});
