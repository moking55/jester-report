import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { formSpec, sampleValues, validate } from "@/lib/form";
import { canEditExactly, num, parseExact, stringifyExact } from "@/lib/json-exact";
import {
  addField,
  canMove,
  changedFiles,
  DATA_KINDS,
  fieldTree,
  findField,
  keyProblem,
  markSaved,
  moveField,
  openBuilder,
  PARAM_KINDS,
  removeField,
  renameField,
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

// ---- T3: move, rename, remove, samples --------------------------------------------------------------

const open = (name: string) => unwrap(openBuilder(starterFiles(name)));
const sampleOf = (b: Builder, name = "sample.json") => JSON.parse(serialize(b)[name]!);
const TODAY = "2026-11-19";

/** The sample passes the schema as far as lib/form.ts can tell (the issue form's own checks). */
function dataErrors(b: Builder, sample = "sample.json"): Record<string, string> {
  const out = serialize(b);
  const spec = formSpec(out["report.json"]!, out[b.schemaName]!);
  const errors = validate(spec, sampleValues(spec, out[sample]!));
  return Object.fromEntries(Object.entries(errors).filter(([p]) => p.startsWith("/data")));
}

/** Every key used in the sample under `keys` (every row of arrays). */
function sampleKeys(value: unknown, keys: string[]): string[] {
  if (Array.isArray(value)) return value.flatMap((v) => sampleKeys(v, keys));
  if (typeof value !== "object" || value === null) return [];
  if (!keys.length) return Object.keys(value);
  return sampleKeys((value as Record<string, unknown>)[keys[0]], keys.slice(1));
}

describe("rename", () => {
  it("renames a group everywhere: properties order, required, samples, form.json, lists paths", () => {
    let b = open("quotation");
    b = unwrap(setProps(b, data("customer", "name"), { width: "half" }));
    const r = unwrap(renameField(b, data("customer"), "client"));
    expect(r.path).toEqual(data("client"));
    b = r.builder;
    const schema = schemaOf(b);
    expect(Object.keys(schema.properties)).toEqual(["company", "client", "items", "discount"].filter((k) => k in schema.properties));
    expect(Object.keys(schema.properties).indexOf("client")).toBe(1);
    expect(schema.required).toContain("client");
    expect(schema.required).not.toContain("customer");
    expect(sampleOf(b).client).toBeDefined();
    expect(sampleOf(b).customer).toBeUndefined();
    expect(JSON.parse(serialize(b)["form.json"]!).fields).toEqual({ "/data/client/name": { width: "half" } });
    expect(dataErrors(b)).toEqual({});
  });

  it("renames a table and its lists path, and a column named by id/sort/groupBy", () => {
    let b = open("sales-grouped");
    b = unwrap(renameField(b, data("records"), "rows")).builder;
    expect(reportOf(b).lists.records.path).toBe("/rows");
    b = unwrap(renameField(b, data("rows", "region"), "area")).builder;
    expect(reportOf(b).lists.records).toMatchObject({ sort: ["area", "id"], groupBy: { key: "area" } });
    expect(sampleKeys(sampleOf(b), ["rows"])).not.toContain("region");
    expect(sampleKeys(sampleOf(b), ["rows"])).toContain("area");
    b = unwrap(renameField(b, data("rows", "id"), "rowId")).builder;
    expect(reportOf(b).lists.records.id).toBe("rowId");
    expect(dataErrors(b)).toEqual({});
  });

  it("renames inside nested lists: child path and child id", () => {
    let b = open("purchase-order");
    b = unwrap(renameField(b, data("orders", "details"), "lines")).builder;
    expect(reportOf(b).lists.orders.lists.details.path).toBe("/lines");
    b = unwrap(renameField(b, data("orders"), "pos")).builder;
    expect(reportOf(b).lists.orders.path).toBe("/pos");
    expect(reportOf(b).lists.orders.lists.details.path).toBe("/lines"); // relative to the row: unchanged
    expect(sampleKeys(sampleOf(b), ["pos"])).toContain("lines");
    expect(dataErrors(b)).toEqual({});
  });

  it("renames parameters in place and refuses bad keys", () => {
    let b = open("quotation");
    const p: FieldPath = { section: "params", keys: ["locale"] };
    b = unwrap(renameField(b, p, "lang")).builder;
    expect(Object.keys(reportOf(b).parameters)).toEqual(["quoteId", "lang", "docDate"]);
    expect(renameField(b, { section: "params", keys: ["lang"] }, "quoteId").ok).toBe(false);
    expect(renameField(b, data("customer"), "__proto__").ok).toBe(false);
    expect(renameField(b, data("customer"), "1x").ok).toBe(false);
  });
});

describe("remove", () => {
  it("removes from schema, required, samples and form.json", () => {
    let b = open("quotation");
    b = unwrap(setProps(b, data("customer", "name"), { width: "half" }));
    b = unwrap(removeField(b, data("customer")));
    expect(schemaOf(b).properties.customer).toBeUndefined();
    expect(schemaOf(b).required).not.toContain("customer");
    expect(sampleOf(b).customer).toBeUndefined();
    expect(serialize(b)["form.json"]).toBeNull();
    expect(dataErrors(b)).toEqual({});
  });

  it("refuses tables and columns that report.json lists use, and groups holding them", () => {
    const b = open("purchase-order");
    expect(removeField(b, data("orders")).ok).toBe(false);
    expect(removeField(b, data("orders", "details")).ok).toBe(false);
    expect(removeField(b, data("orders", "orderId")).ok).toBe(false);
    const r = removeField(open("sales-grouped"), data("records", "region"));
    expect(r.ok ? "" : r.error).toContain("lists.records");
  });

  it("removes a plain column from every row", () => {
    let b = open("quotation");
    const col = fieldTree(b).data.find((f) => f.key === "items")!.children.find((c) => c.key !== "id")!.key;
    b = unwrap(removeField(b, data("items", col)));
    expect(sampleKeys(sampleOf(b), ["items"])).not.toContain(col);
  });
});

describe("move", () => {
  it("reorders within a level, keeps samples", () => {
    let b = open("quotation");
    const before = Object.keys(schemaOf(b).properties);
    b = unwrap(moveField(b, data(before[0]), { section: "data", parentKeys: [], index: 99 })).builder;
    expect(Object.keys(schemaOf(b).properties)).toEqual([...before.slice(1), before[0]]);
    expect(sampleOf(b)).toEqual(sampleOf(open("quotation")));
  });

  it("moves into a group carrying the sample value and required", () => {
    let b = blank();
    b = unwrap(addField(b, "data", [], 99, "group")).builder; // field1
    const r = unwrap(moveField(b, data("title"), { section: "data", parentKeys: ["field1"], index: 0 }, TODAY));
    b = r.builder;
    expect(r.path).toEqual(data("field1", "title"));
    expect(schemaOf(b).properties.field1.required).toEqual(["title"]);
    expect(schemaOf(b).required ?? []).not.toContain("title");
    expect(sampleOf(b)).toEqual({ field1: { title: "สวัสดี Jester" } });
  });

  it("moves into a table: only scalars; required columns get example values in every row", () => {
    let b = open("quotation");
    b = unwrap(addField(b, "data", [], 99, "date")).builder; // fieldN at root
    const key = fieldTree(b).data.at(-1)!.key;
    b = unwrap(setProps(b, data(key), { required: true }, TODAY));
    expect(sampleOf(b)[key]).toBe(TODAY);
    b = unwrap(moveField(b, data(key), { section: "data", parentKeys: ["items"], index: 0 }, TODAY)).builder;
    expect(sampleOf(b)[key]).toBeUndefined();
    for (const row of sampleOf(b).items) expect(row[key]).toBe(TODAY);
    expect(dataErrors(b)).toEqual({});
    expect(canMove(b, data("customer"), { section: "data", parentKeys: ["items"], index: 0 })).toContain("ช่องธรรมดา");
  });

  it("refuses cross-section moves, moves into itself, name clashes and locked tables", () => {
    let b = blank();
    b = unwrap(addField(b, "data", [], 99, "group")).builder; // field1
    b = unwrap(addField(b, "data", ["field1"], 0, "text")).builder; // field1.field1
    expect(canMove(b, data("title"), { section: "params", parentKeys: [], index: 0 })).not.toBeNull();
    expect(canMove(b, data("field1"), { section: "data", parentKeys: ["field1"], index: 0 })).not.toBeNull();
    expect(canMove(b, data("field1", "field1"), { section: "data", parentKeys: [], index: 0 })).toContain("field1");
    const po = open("purchase-order");
    b = unwrap(addField(po, "data", [], 99, "group")).builder;
    const g = fieldTree(b).data.at(-1)!.key;
    expect(canMove(b, data("orders"), { section: "data", parentKeys: [g], index: 0 })).toContain("lists.orders");
  });

  it("reorders parameters", () => {
    const b = unwrap(moveField(open("quotation"), { section: "params", keys: ["docDate"] }, { section: "params", parentKeys: [], index: 0 })).builder;
    expect(Object.keys(reportOf(b).parameters)).toEqual(["docDate", "quoteId", "locale"]);
  });
});

describe("required fills samples", () => {
  it("gives every kind a value that passes, numbers exactly", () => {
    let b = blank();
    for (const kind of DATA_KINDS) b = unwrap(addField(b, "data", [], 99, kind)).builder;
    b = unwrap(addField(b, "data", ["field8"], 0, "money")).builder; // group gets a required child first
    b = unwrap(setProps(b, data("field8", "field1"), { required: true }, TODAY));
    for (let i = 1; i <= 9; i++) b = unwrap(setProps(b, data(`field${i}`), { required: true }, TODAY));
    const s = sampleOf(b);
    expect(s).toMatchObject({
      field1: "ตัวอย่าง",
      field2: "ตัวอย่าง",
      field3: 0,
      field4: "0.00",
      field5: TODAY,
      field6: "ตัวเลือก 1",
      field7: false,
      field8: { field1: "0.00" },
      field9: [],
    });
    expect(serialize(b)["sample.json"]).toContain('"field3": 0,');
    expect(dataErrors(b)).toEqual({});
  });

  it("does not overwrite a value the sample already has", () => {
    const b = unwrap(setProps(blank(), data("title"), { required: true }, TODAY));
    expect(sampleOf(b).title).toBe("สวัสดี Jester");
  });
});
