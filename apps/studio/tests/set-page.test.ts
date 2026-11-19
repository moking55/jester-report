import { describe, expect, it } from "vitest";

import { changePage, setPage } from "@/lib/paper";

const A5 = { size: "A5", orientation: "portrait", layout: "flow" } as const;

describe("setPage", () => {
  it("replaces only the page object, keeping the rest as written", () => {
    const src = '{\n  "name": "x",\n  "page": {\n    "size": "A4",\n    "marginsMm": { "top": 20 }\n  },\n  "fonts": { "body": ["A"] }\n}\n';
    const out = setPage(src, { ...A5, marginsMm: { top: 20 } })!;
    expect(JSON.parse(out).page).toEqual({ size: "A5", orientation: "portrait", marginsMm: { top: 20 } });
    expect(out.startsWith('{\n  "name": "x",\n  "page": {\n    "size": "A5"')).toBe(true);
    expect(out.endsWith('  },\n  "fonts": { "body": ["A"] }\n}\n')).toBe(true);
  });

  it("adds page when there is none; drops fields that do not belong to the size", () => {
    const out = setPage('{\n  "name": "x"\n}\n', { size: "roll", orientation: "landscape", rollWidthMm: 58, layout: "flow", widthMm: 9 })!;
    expect(JSON.parse(out)).toEqual({ name: "x", page: { size: "roll", rollWidthMm: 58 } });
    const free = JSON.parse(setPage("{}", { ...A5, layout: "free" })!);
    expect(free.page).toEqual({ size: "A5", orientation: "portrait", layout: "free" });
    expect(setPage("[1]", A5)).toBeNull();
    expect(setPage("{oops", A5)).toBeNull();
  });

  it("custom keeps its width and height", () => {
    const out = setPage("{}", { size: "custom", orientation: "portrait", widthMm: 100, heightMm: 50, layout: "flow", marginsMm: { top: 5 } })!;
    expect(JSON.parse(out).page).toEqual({ size: "custom", orientation: "portrait", widthMm: 100, heightMm: 50, marginsMm: { top: 5 } });
  });
});

describe("changePage", () => {
  it("changes the size and keeps the rest; margins shrink to leave room", () => {
    const out = changePage('{\n  "page": { "size": "A4", "marginsMm": { "top": 20, "bottom": 20, "left": 15, "right": 15 } }\n}\n', { size: "A6" })!;
    expect(JSON.parse(out).page).toEqual({ size: "A6", orientation: "portrait", marginsMm: { top: 20, bottom: 20, left: 15, right: 15 } });
    const custom = JSON.parse(changePage("{}", { size: "custom", widthMm: 100, heightMm: 50 })!).page;
    expect(custom).toMatchObject({ size: "custom", widthMm: 100, heightMm: 50, marginsMm: { top: 15, bottom: 15, left: 15, right: 15 } });
  });

  it("custom starts from the sheet it replaces; orientation flips", () => {
    const out = changePage('{"page": {"size": "A5"}}', { size: "custom" })!;
    expect(JSON.parse(out).page).toMatchObject({ size: "custom", widthMm: 148, heightMm: 210 });
    expect(JSON.parse(changePage("{}", { orientation: "landscape" })!).page.orientation).toBe("landscape");
  });

  it("a roll cannot become a sheet nor a sheet a roll", () => {
    expect(changePage('{"page": {"size": "roll", "rollWidthMm": 80}}', { size: "A4" })).toBeNull();
    expect(changePage("{}", { size: "roll", rollWidthMm: 80 })).toBeNull();
    expect(JSON.parse(changePage('{"page": {"size": "roll", "rollWidthMm": 80}}', { rollWidthMm: 58 })!).page).toEqual({ size: "roll", rollWidthMm: 58 });
  });
});
