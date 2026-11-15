import { produce } from "immer";
import { describe, expect, it } from "vitest";

import { failed, initialState, reloaded, saved, setDirty, type Draft } from "@/lib/workspace";

const draft = (revision: number, names = ["report.json", "template.html", "sample.json"]): Draft => ({
  templateId: "quotation",
  revision,
  files: names.map((name) => ({ name, content: `<${name}>`, sha256: "x" })),
  assets: [],
  updatedAt: "2026-11-15T00:00:00Z",
});

const problem = (code: string, status: number, extra = {}) =>
  ({ type: "x", title: code, status, code, retryable: false, ...extra }) as never;

describe("workspace state", () => {
  it("opens template.html and starts clean", () => {
    const s = initialState(draft(3));
    expect(s.active).toBe("template.html");
    expect(s.dirty).toEqual([]);
  });

  it("a save moves the revision on and leaves the loaded files alone", () => {
    let s = produce(initialState(draft(3)), setDirty("template.html", true));
    const files = s.files;
    s = produce(s, saved("template.html", 4, false));
    expect(s.revision).toBe(4);
    expect(s.dirty).toEqual([]);
    expect(s.files).toBe(files); // same array: the editor keeps its undo history
  });

  it("text typed during the save keeps the file dirty", () => {
    let s = produce(initialState(draft(3)), setDirty("template.html", true));
    s = produce(s, saved("template.html", 4, true));
    expect(s.dirty).toEqual(["template.html"]);
  });

  it("412 shows the conflict and keeps the revision, so nothing is overwritten", () => {
    let s = produce(initialState(draft(3)), setDirty("template.html", true));
    s = produce({ ...s, saving: true }, failed(problem("REVISION_CONFLICT", 412), "ignored"));
    expect(s.conflict).toBe(true);
    expect(s.revision).toBe(3);
    expect(s.dirty).toEqual(["template.html"]);
    expect(s.saving).toBe(false);
  });

  it("422 keeps the problems with their lines", () => {
    const p = { severity: "error" as const, code: "EXPRESSION_INVALID", message: "m", file: "template.html", line: 7 };
    const s = produce(initialState(draft(3)), failed(problem("INPUT_INVALID", 422, { problems: [p] }), "แก้ไม่ได้"));
    expect(s.error).toBe("แก้ไม่ได้");
    expect(s.problems).toEqual([p]);
    expect(s.conflict).toBe(false);
  });

  it("reload takes the newest draft and keeps the open file if it still exists", () => {
    let s = produce(initialState(draft(3)), (d) => {
      d.active = "sample.json";
      d.conflict = true;
      d.dirty = ["sample.json"];
    });
    s = produce(s, reloaded(draft(9)));
    expect([s.revision, s.active, s.conflict, s.dirty]).toEqual([9, "sample.json", false, []]);
    s = produce(s, reloaded(draft(10, ["report.json", "template.html"])));
    expect(s.active).toBe("template.html");
  });
});
