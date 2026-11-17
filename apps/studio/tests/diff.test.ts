import { describe, expect, it } from "vitest";

import { compare, EMPTY } from "@/lib/diff";

const file = (name: string, content: string) => ({ name, content });
const asset = (name: string, sha256: string) => ({ name, sha256 });

describe("compare", () => {
  it("lists added, removed and changed files and assets, files first", () => {
    const from = {
      files: [file("template.html", "<p>a</p>"), file("old.css", "x"), file("report.json", "{}")],
      assets: [asset("logo.png", "aa"), asset("gone.svg", "bb")],
    };
    const to = {
      files: [file("template.html", "<p>b</p>"), file("report.json", "{}"), file("new.css", "y")],
      assets: [asset("logo.png", "cc"), asset("photo.webp", "dd")],
    };
    expect(compare(from, to)).toEqual([
      { name: "new.css", kind: "file", status: "added" },
      { name: "old.css", kind: "file", status: "removed" },
      { name: "template.html", kind: "file", status: "changed" },
      { name: "gone.svg", kind: "asset", status: "removed" },
      { name: "logo.png", kind: "asset", status: "changed" },
      { name: "photo.webp", kind: "asset", status: "added" },
    ]);
  });

  it("finds nothing between equal snapshots", () => {
    const side = { files: [file("a.html", "x")], assets: [asset("a.png", "1")] };
    expect(compare(side, structuredClone(side))).toEqual([]);
  });

  it("treats everything as added when there is no earlier version", () => {
    expect(compare(EMPTY, { files: [file("a.html", "")], assets: [] })).toEqual([
      { name: "a.html", kind: "file", status: "added" },
    ]);
  });
});
