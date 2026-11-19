import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildTest } from "@/components/designer/BlockPanels";
import { CustomCodeModal } from "@/components/designer/CustomCodeModal";

afterEach(cleanup);

/** Replace the modal editor's text as if typed. */
function type(text: string) {
  const view = EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)!;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

describe("CustomCodeModal", () => {
  it("will not close on broken code and says which line", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<CustomCodeModal code="<div></div>" reportJson={undefined} readOnly={false} onSave={onSave} onClose={onClose} />);
    type("<div>\n{% if x %}\n</div>");
    fireEvent.click(screen.getByRole("button", { name: "ตกลง" }));
    expect(screen.getByRole("alert").textContent).toMatch(/บรรทัด \d/);
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hands back code that checks out; unchanged code just closes", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<CustomCodeModal code="<div></div>" reportJson={undefined} readOnly={false} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "ตกลง" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    type("{% if x %}<b>{{ y }}</b>{% endif %}");
    fireEvent.click(screen.getByRole("button", { name: "ตกลง" }));
    expect(onSave).toHaveBeenCalledWith("{% if x %}<b>{{ y }}</b>{% endif %}");
  });

  it("read-only shows no ตกลง", () => {
    render(<CustomCodeModal code="<div></div>" reportJson={undefined} readOnly onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "ตกลง" })).toBeNull();
  });
});

describe("buildTest", () => {
  it.each([
    ["data.total", ">", "1000", "data.total > 1000"],
    ["data.status", "==", "paid", 'data.status == "paid"'],
    ["data.note", "has", "", "data.note"],
    ["data.note", "empty", "", "not data.note"],
    ["data.flag", "==", "True", "data.flag == true"],
  ])("%s %s %s", (f, op, v, out) => expect(buildTest(f, op, v)).toBe(out));
});
