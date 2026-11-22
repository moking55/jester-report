import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  addTag,
  chipStyle,
  colorMap,
  colorsOf,
  colorOf,
  hasAllTags,
  normalizeTag,
  normalizeTags,
  sameTags,
  TAG_COLORS,
  tagsFromQuery,
  withPending,
} from "@/lib/tags";

// the api's own test reads this file too: both sides must give these answers
const CASES = JSON.parse(readFileSync("../api/tests/tags/cases.json", "utf-8")) as {
  ok: { input: string[]; output: string[] }[];
  bad: { input: string[]; tag: string | null }[];
};

describe("normalizeTags (same rules as the api)", () => {
  it.each(CASES.ok.map((c, i) => [i, c] as const))("accepts shared case %i", (_, c) => {
    expect(normalizeTags(c.input)).toEqual({ ok: true, tags: c.output });
  });

  it.each(CASES.bad.map((c, i) => [i, c] as const))("rejects shared case %i and names the tag", (_, c) => {
    const got = normalizeTags(c.input);
    expect(got.ok).toBe(false);
    if (!got.ok && c.tag !== null) expect(got.tag).toBe(c.tag);
  });

  it("gives a Thai reason", () => {
    expect(normalizeTag("a,b")).toEqual({ ok: false, error: "tag ใส่เครื่องหมายจุลภาค (,) ไม่ได้" });
    expect(normalizeTag("")).toMatchObject({ ok: false });
    expect(normalizeTag("x".repeat(31))).toMatchObject({ ok: false });
  });
});

describe("addTag", () => {
  it("adds, trims and keeps order", () => {
    expect(addTag(["a"], "  ลูกค้า-ก ")).toEqual({ ok: true, tags: ["a", "ลูกค้า-ก"] });
  });
  it("a tag already there is not an error and not added twice", () => {
    expect(addTag(["a", "b"], " a ")).toEqual({ ok: true, tags: ["a", "b"] });
  });
  it("refuses the eleventh and says why", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `t${i}`);
    const got = addTag(ten, "more");
    expect(got.ok).toBe(false);
    expect(addTag(ten, "t3").ok).toBe(true); // already there: still fine
  });
  it("refuses a bad tag", () => {
    expect(addTag([], "a,b").ok).toBe(false);
    expect(addTag([], "   ").ok).toBe(false);
  });
});

describe("colours", () => {
  it("knows the nine the api knows", () => {
    expect([...TAG_COLORS]).toEqual(["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"]);
  });
  it("anything unexpected is gray", () => {
    expect(colorOf("red")).toBe("red");
    expect(colorOf("#ff0000")).toBe("gray");
    expect(colorOf(undefined)).toBe("gray");
  });
  it("chipStyle sets one custom property from the base colour", () => {
    expect(chipStyle("red")).toEqual({ "--tag-base": "#c0392b" });
    expect(chipStyle("nope")).toEqual(chipStyle("gray"));
  });
  it("colorMap keeps a colour per name", () => {
    expect(colorMap([{ tag: "vip", color: "red" }, { tag: "q4", color: "weird" }])).toEqual({ vip: "red", q4: "gray" });
  });
});

describe("filters", () => {
  it("an item needs every wanted tag, exactly", () => {
    expect(hasAllTags(["vip", "q4"], ["vip"])).toBe(true);
    expect(hasAllTags(["vip", "q4"], ["vip", "q4"])).toBe(true);
    expect(hasAllTags(["vip"], ["vip", "q4"])).toBe(false);
    expect(hasAllTags(["vip"], ["VIP"])).toBe(false);
    expect(hasAllTags([], [])).toBe(true);
  });
  it("reads ?tag= as one value, a list, or nothing, without blanks or repeats", () => {
    expect(tagsFromQuery(undefined)).toEqual([]);
    expect(tagsFromQuery("a")).toEqual(["a"]);
    expect(tagsFromQuery(["a", " ", "b", "a"])).toEqual(["a", "b"]);
  });
});

describe("withPending", () => {
  it("adds what is still typed, and leaves the set alone when nothing is", () => {
    expect(withPending(["a"], " b ")).toEqual({ ok: true, tags: ["a", "b"] });
    expect(withPending(["a"], "   ")).toEqual({ ok: true, tags: ["a"] });
    expect(withPending(["a"], "x,y").ok).toBe(false);
  });
});

describe("sameTags", () => {
  it("needs the same tags in the same order", () => {
    expect(sameTags(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameTags(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameTags(["a"], ["a", "b"])).toBe(false);
    expect(sameTags([], [])).toBe(true);
  });
});

describe("colorsOf", () => {
  it("keeps only the colours of the given tags", () => {
    expect(colorsOf(["vip", "new"], { vip: "red", q4: "teal" })).toEqual({ vip: "red" });
  });
});
