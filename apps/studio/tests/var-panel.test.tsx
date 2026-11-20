import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { VarPanel } from "@/components/designer/VarPanel";
import { readBlocks } from "@/lib/doc-blocks";
import type { Edited, Result } from "@/lib/doc-edit";

afterEach(cleanup);

/** The panel over a template that its edits change, as the designer does. */
function Harness({ start, onSrc }: { start: string; onSrc: (src: string) => void }) {
  const [src, setSrc] = useState(start);
  const block = readBlocks(src).items[0];
  const apply = (r: Result<Edited> | Edited) => {
    const e = "ok" in r ? (r.ok ? r.value : null) : r;
    if (e) {
      setSrc(e.src);
      onSrc(e.src);
    }
  };
  return block.detail.kind === "set" ? <VarPanel block={block} src={src} inner={block.detail.inner} fields={[]} readOnly={false} apply={apply} /> : null;
}

describe("VarPanel", () => {
  it("keeps the type chosen while the conditional rows are filled in one by one", () => {
    const out = { src: "" };
    render(<Harness start="{% set status = 1 %}" onSrc={(src) => (out.src = src)} />);
    fireEvent.change(screen.getByLabelText("ประเภท"), { target: { value: "text" } });
    fireEvent.change(screen.getByLabelText("ตั้งค่าแบบ"), { target: { value: "if" } });
    const test = screen.getByLabelText("เงื่อนไขข้อ 1");
    fireEvent.change(test, { target: { value: "1 == 1" } });
    act(() => test.blur()); // saves `status = 1 if 1 == 1 else ""`, which on its own would read as an expression
    fireEvent.blur(test);
    expect((screen.getByLabelText("ประเภท") as HTMLSelectElement).value).toBe("text");
    const value = screen.getByLabelText("ค่าข้อ 1");
    fireEvent.change(value, { target: { value: "ชำระแล้ว" } });
    fireEvent.blur(value);
    const other = screen.getByLabelText("ไม่เช่นนั้น");
    fireEvent.change(other, { target: { value: "ค้างชำระ" } });
    fireEvent.blur(other);
    expect(out.src).toBe('{% set status = "ชำระแล้ว" if 1 == 1 else "ค้างชำระ" %}');
  });

  it("starts again from the file when the tag changes from elsewhere (an undo)", () => {
    const block = (src: string) => readBlocks(src).items[0];
    const props = (src: string) => ({ block: block(src), src, inner: (block(src).detail as { inner: string }).inner, fields: [], readOnly: false, apply: () => undefined });
    const { rerender } = render(<VarPanel {...props("{% set n = 1 %}")} />);
    expect((screen.getByLabelText("ค่า") as HTMLInputElement).value).toBe("1");
    rerender(<VarPanel {...props("{% set n = 2 %}")} />);
    expect((screen.getByLabelText("ค่า") as HTMLInputElement).value).toBe("2");
  });
});
