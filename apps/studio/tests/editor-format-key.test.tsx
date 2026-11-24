// Shift+Alt+F formats the open file in the code editor (v1.15.1; it was Ctrl+Shift+Space before).
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Editor } from "@/components/Editor";

afterEach(cleanup);

function mount(name: string, content: string) {
  render(
    <Editor
      files={[{ name, content }]}
      active={name}
      generation={0}
      problems={[]}
      onDirty={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  const dom = document.querySelector(".cm-content") as HTMLElement;
  return { dom, view: EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)! };
}

const shiftAltF = { key: "F", code: "KeyF", keyCode: 70, shiftKey: true, altKey: true };
const ctrlShiftSpace = { key: " ", code: "Space", keyCode: 32, shiftKey: true, ctrlKey: true };

describe("format key", () => {
  it("Shift+Alt+F formats the file", async () => {
    const { dom, view } = mount("report.css", "td{padding:1mm;color:red}");
    fireEvent.keyDown(dom, shiftAltF);
    await waitFor(() => expect(view.state.doc.toString()).toBe("td {\n  padding: 1mm;\n  color: red;\n}\n"));
  });

  it("Ctrl+Shift+Space no longer does", async () => {
    const { dom, view } = mount("report.css", "td{padding:1mm;color:red}");
    fireEvent.keyDown(dom, ctrlShiftSpace);
    await new Promise((r) => setTimeout(r, 300)); // prettier would have answered by now
    expect(view.state.doc.toString()).toBe("td{padding:1mm;color:red}");
  });

  it("a file prettier cannot read is left as it is", async () => {
    const { dom, view } = mount("data.json", "{ broken");
    fireEvent.keyDown(dom, shiftAltF);
    await new Promise((r) => setTimeout(r, 300));
    expect(view.state.doc.toString()).toBe("{ broken");
  });
});
