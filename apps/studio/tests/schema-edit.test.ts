import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canEditExactly, num, parseExact, stringifyExact } from "@/lib/json-exact";
import {
  addField,
  changedFiles,
  DATA_KINDS,
  fieldTree,
  findField,
  keyProblem,
  markSaved,
  openBuilder,
  PARAM_KINDS,
  serialize,
  setProps,
  type Builder,
  type FieldPath,
  type Result,
} from "@/lib/schema-edit";

const STARTERS = join(__dirname, "../../api/src/jester_api/template_store/starters");

function starterFiles(name: string): Record<string, string> {
  const dir = join(STARTERS, name);
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => [f, readFileSync(join(dir, f), "utf8")]),
  );
}

const norm = (t: string) => `${t.replace(/\r\n/g, "\n").replace(/\n?$/, "")}\n`;

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const blank = () => unwrap(openBuilder(starterFiles("blank")));
const data = (...keys: string[]): FieldPath => ({ section: "data", keys });
const schemaOf = (b: Builder) => JSON.parse(serialize(b)[b.schemaName]!);
const reportOf = (b: Builder) => JSON.parse(serialize(b)["report.json"]!);

describe("exact JSON", () => {
  it("runs where the builder runs", () => {
    expect(canEditExactly()).toBe(true);
  });

  it("keeps every number as written", () => {
    const text = '{\n  "a": 12345678901234567.89,\n  "b": 1e400,\n  "c": -0,\n  "d": 0.10,\n  "e": [1, 2.50]\n}';
    const v = parseExact(text);
    expect(stringifyExact(v)).toBe(
      '{\n  "a": 12345678901234567.89,\n  "b": 1e400,\n  "c": -0,\n  "d": 0.10,\n  "e": [\n    1,\n    2.50\n  ]\n}\n',
    );
    expect(num((v as Record<string, unknown>).d)).toBe(0.1);
  });
});

describe("open and round-trip", () => {
  for (const name of readdirSync(STARTERS)) {
    it(`writes starter ${name} back unchanged`, () => {
      const files = starterFiles(name);
      const b = unwrap(openBuilder(files));
      const out = serialize(b);
      for (const [file, t] of Object.entries(out)) {
        if (t === null) expect(files[file]).toBeUndefined();
        else expect(t).toBe(norm(files[file]));
      }
      expect(changedFiles(b)).toEqual([]);
    });
  }

  it("does not call a hand-formatted file changed until it is edited", () => {
    const files = starterFiles("blank");
    files["data.schema.json"] = JSON.stringify(JSON.parse(files["data.schema.json"])); // one line
    const b = unwrap(openBuilder(files));
    expect(changedFiles(b)).toEqual([]);
    const edited = unwrap(setProps(b, data("title"), { label: "หัวข้อ" }));
    expect(changedFiles(edited).map((f) => f.name)).toEqual(["data.schema.json"]);
    expect(changedFiles(markSaved(edited))).toEqual([]);
  });

  it("refuses a draft whose report.json or schema cannot be read, warns on a broken sample", () => {
    expect(openBuilder({ "report.json": "{" }).ok).toBe(false);
    const files = starterFiles("blank");
    expect(openBuilder({ ...files, "data.schema.json": "[]" }).ok).toBe(false);
    const b = unwrap(openBuilder({ ...files, "sample.json": "{" }));
    expect(b.warnings[0]).toContain("sample.json");
    expect(Object.keys(serialize(b))).not.toContain("sample.json");
  });

  it("keeps keywords it does not know and numbers exactly when editing", () => {
    const files = starterFiles("blank");
    files["data.schema.json"] = JSON.stringify({
      type: "object",
      additionalProperties: false,
      $comment: "keep me",
      properties: {
        total: { type: "number", maximum: 12345678901234567.89, examples: [1], "x-ui": { a: 1 } },
        any: { oneOf: [{ type: "string" }, { type: "number" }] },
      },
    }).replace("12345678901234568", "12345678901234567.89");
    const b = unwrap(openBuilder(files));
    const edited = unwrap(setProps(b, data("total"), { label: "รวม" }));
    const text = serialize(edited)["data.schema.json"]!;
    expect(text).toContain('"maximum": 12345678901234567.89');
    expect(text).toContain('"$comment": "keep me"');
    expect(text).toContain('"x-ui"');
    expect(text).toContain('"oneOf"');
    expect(text).toContain('"additionalProperties": false');
    const any = findField(edited, data("any"))!;
    expect(any.kind).toBeNull();
    expect(setProps(edited, data("any"), { label: "x" }).ok).toBe(false);
  });

  it("reads keys that start with a digit and type lists as read-only", () => {
    const files = starterFiles("blank");
    files["data.schema.json"] = JSON.stringify({
      type: "object",
      properties: { a: { type: ["string", "null"] }, b: { type: "string", format: "email" } },
    });
    const tree = fieldTree(unwrap(openBuilder(files)));
    expect(tree.data.map((f) => [f.key, f.kind])).toEqual([
      ["a", null],
      ["b", null],
    ]);
  });
});

describe("tree", () => {
  it("shows quotation's groups, table columns and parameters with Thai labels", () => {
    const tree = fieldTree(unwrap(openBuilder(starterFiles("quotation"))));
    expect(tree.params.map((f) => [f.key, f.kind])).toEqual([
      ["quoteId", "text"],
      ["locale", "choice"],
      ["docDate", "date"],
    ]);
    const items = tree.data.find((f) => f.key === "items")!;
    expect(items.kind).toBe("table");
    expect(items.children.map((c) => c.pointer)).toContain("/data/items/qty");
    expect(tree.data.find((f) => f.key === "customer")!.children[0].props.label).toBe("ชื่อลูกค้า");
  });
});

describe("add", () => {
  it("adds every kind to the data with a Thai title and a free fieldN key", () => {
    let b = blank();
    for (const kind of DATA_KINDS) b = unwrap(addField(b, "data", [], 99, kind)).builder;
    const schema = schemaOf(b);
    expect(Object.keys(schema.properties)).toEqual(["title", ...DATA_KINDS.map((_, i) => `field${i + 1}`)]);
    expect(schema.properties.field4).toEqual({ title: "เงิน", type: "string", format: "decimal" });
    expect(schema.properties.field9).toEqual({ title: "ตารางรายการ", type: "array", items: { type: "object", properties: {} } });
    expect(fieldTree(b).data.map((f) => f.kind)).toEqual(["text", ...DATA_KINDS]);
    // textarea and money keep their widget in form.json
    expect(JSON.parse(serialize(b)["form.json"]!).fields).toEqual({
      "/data/field2": { widget: "textarea" },
      "/data/field4": { widget: "money" },
    });
  });

  it("adds parameters of the seven scalar kinds and refuses groups and tables there", () => {
    let b = blank();
    for (const kind of PARAM_KINDS) b = unwrap(addField(b, "params", [], 99, kind)).builder;
    expect(Object.values(reportOf(b).parameters).map((p) => (p as { type: string }).type)).toEqual([
      "string",
      "string",
      "integer",
      "decimal",
      "date",
      "enum",
      "boolean",
    ]);
    expect(addField(b, "params", [], 0, "group").ok).toBe(false);
    expect(addField(b, "params", [], 0, "table").ok).toBe(false);
  });

  it("inserts at the index, into groups and tables, and only scalars into tables", () => {
    let b = blank();
    b = unwrap(addField(b, "data", [], 0, "group")).builder; // field1 before title
    expect(Object.keys(schemaOf(b).properties)).toEqual(["field1", "title"]);
    b = unwrap(addField(b, "data", ["field1"], 0, "text")).builder;
    b = unwrap(addField(b, "data", [], 99, "table")).builder; // field2
    b = unwrap(addField(b, "data", ["field2"], 0, "money")).builder;
    expect(schemaOf(b).properties.field2.items.properties.field1.format).toBe("decimal");
    expect(findField(b, data("field2", "field1"))!.pointer).toBe("/data/field2/field1");
    expect(addField(b, "data", ["field2"], 0, "group").ok).toBe(false);
    expect(addField(b, "data", ["field2"], 0, "table").ok).toBe(false);
    expect(addField(b, "data", ["title"], 0, "text").ok).toBe(false);
  });
});

describe("properties", () => {
  it("sets and clears label, description, rules and required", () => {
    let b = unwrap(addField(blank(), "data", [], 99, "text")).builder;
    b = unwrap(
      setProps(b, data("field1"), {
        label: "ชื่อ",
        description: "ชื่อเต็ม",
        required: true,
        minLength: "2",
        maxLength: "40",
        pattern: "^[ก-๙ ]+$",
        defaultValue: "สมชาย",
      }),
    );
    let node = schemaOf(b).properties.field1;
    expect(node).toEqual({
      title: "ชื่อ",
      type: "string",
      description: "ชื่อเต็ม",
      minLength: 2,
      maxLength: 40,
      pattern: "^[ก-๙ ]+$",
      default: "สมชาย",
    });
    expect(schemaOf(b).required).toEqual(["title", "field1"]);
    b = unwrap(setProps(b, data("field1"), { description: "", maxLength: "", required: false, defaultValue: "" }));
    node = schemaOf(b).properties.field1;
    expect(node.description).toBeUndefined();
    expect(node.maxLength).toBeUndefined();
    expect(node.default).toBeUndefined();
    expect(schemaOf(b).required).toEqual(["title"]);
  });

  it("refuses bad values before changing anything", () => {
    const b = unwrap(addField(blank(), "data", [], 99, "number")).builder;
    expect(setProps(b, data("field1"), { label: "x", minimum: "abc" }).ok).toBe(false);
    expect(setProps(b, data("field1"), { defaultValue: "1.5", integer: true }).ok).toBe(false);
    expect(setProps(b, data("field1"), { pattern: "(" }).ok).toBe(false);
    expect(setProps(b, data("field1"), { widget: "radio" }).ok).toBe(false);
    expect(setProps(b, data("nope"), { label: "x" }).ok).toBe(false);
  });

  it("writes number rules and defaults exactly, switches integer", () => {
    let b = unwrap(addField(blank(), "data", [], 99, "number")).builder;
    b = unwrap(setProps(b, data("field1"), { minimum: "0.10", maximum: "12345678901234567.89", defaultValue: "1.50" }));
    const text = serialize(b)["data.schema.json"]!;
    expect(text).toContain('"minimum": 0.10');
    expect(text).toContain('"maximum": 12345678901234567.89');
    expect(text).toContain('"default": 1.50');
    b = unwrap(setProps(b, data("field1"), { integer: true, defaultValue: "3" }));
    expect(schemaOf(b).properties.field1.type).toBe("integer");
    expect(findField(b, data("field1"))!.props).toMatchObject({ integer: true, defaultValue: "3", minimum: "0.10" });
  });

  it("checks choices and their default", () => {
    let b = unwrap(addField(blank(), "data", [], 99, "choice")).builder;
    expect(setProps(b, data("field1"), { options: [] }).ok).toBe(false);
    expect(setProps(b, data("field1"), { options: ["ก", "ก"] }).ok).toBe(false);
    expect(setProps(b, data("field1"), { defaultValue: "ไม่มี" }).ok).toBe(false);
    b = unwrap(setProps(b, data("field1"), { options: ["เงินสด", "โอน"], defaultValue: "โอน", widget: "radio" }));
    expect(schemaOf(b).properties.field1).toMatchObject({ enum: ["เงินสด", "โอน"], default: "โอน" });
    expect(JSON.parse(serialize(b)["form.json"]!).fields["/data/field1"]).toEqual({ widget: "radio" });
    b = unwrap(setProps(b, data("field1"), { options: ["เงินสด"] })); // default no longer an option → dropped
    expect(schemaOf(b).properties.field1.default).toBeUndefined();
  });

  it("follows the api's parameter rules: required clears default, no pattern, title ≤ 80", () => {
    let b = unwrap(addField(blank(), "params", [], 99, "text")).builder;
    const p: FieldPath = { section: "params", keys: ["field1"] };
    b = unwrap(setProps(b, p, { defaultValue: "A", maxLength: "10" }));
    expect(reportOf(b).parameters.field1).toMatchObject({ default: "A", maxLength: 10 });
    b = unwrap(setProps(b, p, { required: true }));
    expect(reportOf(b).parameters.field1.default).toBeUndefined();
    expect(reportOf(b).parameters.field1.required).toBe(true);
    expect(setProps(b, p, { defaultValue: "B" }).ok).toBe(false);
    expect(setProps(b, p, { pattern: "x" }).ok).toBe(false);
    expect(setProps(b, p, { minimum: "1" }).ok).toBe(false);
    expect(setProps(b, p, { label: "ก".repeat(81) }).ok).toBe(false);
  });

  it("sets widths in form.json, full = nothing written", () => {
    let b = unwrap(addField(blank(), "data", [], 99, "text")).builder;
    b = unwrap(setProps(b, data("field1"), { width: "half" }));
    expect(JSON.parse(serialize(b)["form.json"]!).fields["/data/field1"]).toEqual({ width: "half" });
    b = unwrap(setProps(b, data("field1"), { width: "full" }));
    expect(serialize(b)["form.json"]).toBeNull();
  });
});

describe("keys", () => {
  it("follows the api's Name rule and refuses duplicates and reserved names", () => {
    expect(keyProblem("customer_name", [])).toBeNull();
    for (const bad of ["1st", "ชื่อ", "a-b", "", "a b"]) expect(keyProblem(bad, [])).not.toBeNull();
    expect(keyProblem("__proto__", [])).not.toBeNull();
    expect(keyProblem("title", ["title"])).not.toBeNull();
  });
});
