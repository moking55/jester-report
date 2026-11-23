import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { allBlocks, readBlocks } from "@/lib/doc-blocks";
import { formatFile } from "@/lib/prettier";

const STARTERS = join(__dirname, "../../api/src/jester_api/template_store/starters");
const read = (starter: string, file: string) => readFileSync(join(STARTERS, starter, file), "utf8");
const names = readdirSync(STARTERS);

// every Jinja tag, expression and comment, exactly as written
const jinja = (src: string) => [...src.matchAll(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g)].map((m) => m[0]);
const kinds = (src: string) => allBlocks(readBlocks(src)).map((b) => b.kind);

describe("formatFile", () => {
  it.each(names)("%s: template.html keeps every Jinja tag and every Designer block", async (name) => {
    const src = read(name, "template.html");
    const out = await formatFile("template.html", src);
    expect(jinja(out)).toEqual(jinja(src));
    expect(kinds(out)).toEqual(kinds(src));
    expect(await formatFile("template.html", out)).toBe(out); // a second press changes nothing
  });

  it.each(names)("%s: report.json keeps its values and number literals", async (name) => {
    const src = read(name, "report.json");
    const out = await formatFile("report.json", src);
    expect(JSON.parse(out)).toEqual(JSON.parse(src));
  });

  it("keeps decimal text exactly in JSON (no float rounding)", async () => {
    expect(await formatFile("sample.json", '{"a":1.10,"b":0.1000000000000000055511}')).toContain("1.10");
  });

  it("formats CSS", async () => {
    expect(await formatFile("report.css", "td{padding:1mm;color:red}")).toBe("td {\n  padding: 1mm;\n  color: red;\n}\n");
  });

  it("Jinja inside a tag comes back exactly; only spacing between attributes may change", async () => {
    const src = '<table><tr><td {% if x %}class="a"{% endif %} style="width: {{ w }}mm">{{ v }}</td></tr></table>\n';
    const out = await formatFile("template.html", src);
    expect(jinja(out)).toEqual(jinja(src));
    expect(out).toContain('<td {% if x %}class="a" {% endif %} style="width: {{ w }}mm">{{ v }}</td>');
    expect(await formatFile("template.html", out)).toBe(out);
  });

  it("leaves a file alone that already holds the placeholder word", async () => {
    await expect(formatFile("template.html", "<p>jinja0x {{ a }}</p>")).rejects.toThrow();
  });

  it("rejects what it cannot parse, so the editor leaves the file alone", async () => {
    await expect(formatFile("data.json", "{ broken")).rejects.toThrow();
  });
});
