// The form builder's model (SPEC-studio.md "v1.6"). The draft's files are the only truth: the builder parses
// report.json (parameters), the data schema, the samples and form.json, edits the parsed documents with pure
// functions, and writes them back. It changes only the keys it owns, so every keyword it does not know stays.
// Numbers stay exact through lib/json-exact.ts; never hand these documents to lib/form.ts — serialize first.

import { FORM_FILE, readLayout, writeLayout, type Layout, type Widget, type Width } from "./form-layout";
import { exactNumber, isExactNumber, num, numText, parseExact, stringifyExact } from "./json-exact";

export type Kind = "text" | "textarea" | "number" | "money" | "date" | "choice" | "checkbox" | "group" | "table";
export type Section = "params" | "data";
/** keys from the section root; a table column is the array's key followed by the column's */
export type FieldPath = { section: Section; keys: string[] };

export const KIND_LABEL: Record<Kind, string> = {
  text: "ข้อความ",
  textarea: "ข้อความหลายบรรทัด",
  number: "ตัวเลข",
  money: "เงิน",
  date: "วันที่",
  choice: "ตัวเลือก",
  checkbox: "checkbox",
  group: "กลุ่ม",
  table: "ตารางรายการ",
};
export const DATA_KINDS: Kind[] = ["text", "textarea", "number", "money", "date", "choice", "checkbox", "group", "table"];
export const PARAM_KINDS: Kind[] = ["text", "textarea", "number", "money", "date", "choice", "checkbox"];
export const SCALAR_KINDS: Kind[] = PARAM_KINDS;

/** What the properties panel edits; numbers as the text the dev typed, "" or undefined = none. */
export type FieldProps = {
  label?: string;
  description?: string;
  required?: boolean;
  integer?: boolean;
  defaultValue?: string | boolean | null;
  minimum?: string;
  maximum?: string;
  minLength?: string;
  maxLength?: string;
  pattern?: string;
  options?: string[];
  minItems?: string;
  maxItems?: string;
  widget?: Widget | null;
  width?: Width;
};

export type BuilderField = {
  path: FieldPath;
  pointer: string; // the form.json key: "/params/x", "/data/customer/name", "/data/items/qty"
  key: string;
  kind: Kind | null; // null: the builder cannot edit it ("แก้ใน JSON")
  reason?: string; // why it is read-only
  props: FieldProps;
  children: BuilderField[]; // group fields, table columns
};

export type Builder = {
  report: Json;
  schema: Json;
  schemaName: string;
  samples: Record<string, unknown>; // by file name, in report.json order
  layout: Layout;
  warnings: string[];
  base: Record<string, string | null>; // our own serialization of what was opened: "changed" = differs from this
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

type Json = Record<string, unknown>;

export const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
const INTEGER = /^\d+$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UNSUPPORTED = ["oneOf", "anyOf", "allOf", "$ref", "not", "if", "then", "else", "patternProperties"];
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !isExactNumber(v);
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });
const text = (v: unknown) => (typeof v === "string" ? v : undefined);

// ---- open / save ----------------------------------------------------------------------------------

/** The builder for a draft's text files (name → content). Fails only when report.json or the schema cannot be read. */
export function openBuilder(files: Record<string, string>): Result<Builder> {
  const report = parseFile(files, "report.json");
  if (!report.ok) return report;
  if (!isObject(report.value)) return fail("report.json ต้องเป็น object");
  const data = isObject(report.value.data) ? report.value.data : {};
  const schemaName = text(data.schema);
  if (!schemaName) return fail('report.json ไม่มี "data.schema"');
  const schema = parseFile(files, schemaName);
  if (!schema.ok) return schema;
  if (!isObject(schema.value) || schema.value.type !== "object") return fail(`${schemaName} ต้องเป็น {"type": "object"}`);

  const warnings: string[] = [];
  const samples: Record<string, unknown> = {};
  for (const name of Array.isArray(data.samples) ? data.samples : []) {
    if (typeof name !== "string") continue;
    const sample = parseFile(files, name);
    if (sample.ok) samples[name] = sample.value;
    else warnings.push(`${sample.error} — builder จะไม่แก้ไฟล์นี้`);
  }
  const layout = readLayout(files[FORM_FILE]);
  warnings.push(...layout.warnings);

  const builder: Builder = {
    report: report.value,
    schema: schema.value,
    schemaName,
    samples,
    layout: layout.fields,
    warnings,
    base: {},
  };
  // base = our own serialization of what was read, so a hand-formatted file is not "changed" until edited
  return ok({ ...builder, base: serialize(builder) });
}

function parseFile(files: Record<string, string>, name: string): Result<unknown> {
  if (!(name in files)) return fail(`ไม่มีไฟล์ ${name} ใน draft`);
  try {
    return ok(parseExact(files[name]));
  } catch {
    return fail(`${name} ไม่ใช่ JSON ที่ถูกต้อง`);
  }
}

/** Every file the builder owns, as text; form.json null = the file should not exist. */
export function serialize(b: Builder): Record<string, string | null> {
  const out: Record<string, string | null> = { [b.schemaName]: stringifyExact(b.schema) };
  for (const [name, sample] of Object.entries(b.samples)) out[name] = stringifyExact(sample);
  out["report.json"] = stringifyExact(b.report);
  out[FORM_FILE] = writeLayout(b.layout, allPointers(b));
  return out;
}

/** The files to write, in save order (schema → samples → report.json → form.json); text null = delete. */
export function changedFiles(b: Builder): { name: string; text: string | null }[] {
  const now = serialize(b);
  return Object.entries(now)
    .filter(([name, t]) => (b.base[name] ?? null) !== t)
    .map(([name, t]) => ({ name, text: t }));
}

/** After a save: what was written is the new base. */
export const markSaved = (b: Builder): Builder => ({ ...b, base: serialize(b) });

// ---- reading the tree -----------------------------------------------------------------------------

const pointerOf = (path: FieldPath) =>
  `/${path.section}${path.keys.map((k) => `/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`).join("")}`;

function paramKind(p: Json, widget: Widget | undefined): Kind | null {
  switch (p.type) {
    case "string":
      return widget === "textarea" ? "textarea" : "text";
    case "integer":
      return "number";
    case "decimal":
      return "money";
    case "date":
      return "date";
    case "enum":
      return "choice";
    case "boolean":
      return "checkbox";
    default:
      return null;
  }
}

/** The kind of a schema node, or a Thai reason it is read-only. */
function schemaKind(node: unknown, widget: Widget | undefined, inTable: boolean): Kind | string {
  if (!isObject(node)) return "ไม่ใช่ schema แบบ object";
  if (UNSUPPORTED.some((k) => k in node)) return "ใช้ keyword ที่ builder ยังไม่รองรับ";
  if (Array.isArray(node.type)) return "มีหลายชนิด (type เป็น array)";
  if (Array.isArray(node.enum)) {
    return node.type === "string" && node.enum.length > 0 && node.enum.every((v) => typeof v === "string")
      ? "choice"
      : "ตัวเลือกที่ไม่ใช่ข้อความ";
  }
  switch (node.type) {
    case "string":
      if (node.format === undefined) return widget === "textarea" ? "textarea" : "text";
      if (node.format === "date") return "date";
      if (node.format === "decimal") return "money";
      return `format "${String(node.format)}" ที่ builder ยังไม่รองรับ`;
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "checkbox";
    case "object":
      if (inTable) return "กลุ่มในตารางยังไม่รองรับ";
      return isObject(node.properties) ? "group" : "object ที่ไม่มี properties";
    case "array":
      if (inTable) return "ตารางซ้อนตารางยังไม่รองรับ";
      return isObject(node.items) && node.items.type === "object" && isObject(node.items.properties)
        ? "table"
        : "array ที่ไม่ใช่ตารางของ object";
    default:
      return "ไม่มี type";
  }
}

const kindOrNull = (k: Kind | string): Kind | null => ((DATA_KINDS as string[]).includes(k) ? (k as Kind) : null);

function schemaProps(node: Json, required: boolean, layout: Layout, pointer: string, kind: Kind | null): FieldProps {
  const props: FieldProps = {
    label: text(node.title),
    description: text(node.description),
    required,
    width: layout[pointer]?.width ?? "full",
    widget: layout[pointer]?.widget ?? null,
  };
  if (kind === "number") props.integer = node.type === "integer";
  if (kind === "choice") props.options = node.enum as string[];
  const d = node.default;
  props.defaultValue = typeof d === "string" || typeof d === "boolean" ? d : (numText(d) ?? null);
  for (const k of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"] as const) {
    const t = numText(node[k]);
    if (t !== undefined) props[k] = t;
  }
  if (typeof node.pattern === "string") props.pattern = node.pattern;
  return props;
}

function paramProps(p: Json, layout: Layout, pointer: string, kind: Kind | null): FieldProps {
  const d = p.default;
  return {
    label: text(p.title),
    description: text(p.description),
    required: p.required === true,
    width: layout[pointer]?.width ?? "full",
    widget: layout[pointer]?.widget ?? null,
    integer: kind === "number" ? true : undefined,
    options: kind === "choice" && Array.isArray(p.values) ? (p.values as string[]) : undefined,
    defaultValue: typeof d === "string" || typeof d === "boolean" ? d : (numText(d) ?? null),
    maxLength: numText(p.maxLength),
  };
}

function schemaFields(node: Json, keys: string[], layout: Layout, inTable: boolean): BuilderField[] {
  const props = isObject(node.properties) ? node.properties : {};
  const required = new Set(Array.isArray(node.required) ? node.required : []);
  return Object.entries(props).map(([key, child]) => {
    const path: FieldPath = { section: "data", keys: [...keys, key] };
    const pointer = pointerOf(path);
    const found = NAME.test(key) ? schemaKind(child, layout[pointer]?.widget, inTable) : "ชื่อ key ไม่ตรงกติกา (ขึ้นต้นด้วยตัวอักษรหรือ _)";
    const kind = kindOrNull(found);
    const childNode = isObject(child) ? child : {};
    let children: BuilderField[] = [];
    if (kind === "group") children = schemaFields(childNode, path.keys, layout, false);
    if (kind === "table") children = schemaFields(childNode.items as Json, path.keys, layout, true);
    return {
      path,
      pointer,
      key,
      kind,
      reason: kind ? undefined : found,
      props: schemaProps(childNode, required.has(key), layout, pointer, kind),
      children,
    };
  });
}

/** The two sections of the form as the builder shows them, in file order. */
export function fieldTree(b: Builder): { params: BuilderField[]; data: BuilderField[] } {
  const params = Object.entries(isObject(b.report.parameters) ? b.report.parameters : {}).map(([key, raw]) => {
    const path: FieldPath = { section: "params", keys: [key] };
    const pointer = pointerOf(path);
    const p = isObject(raw) ? raw : {};
    const kind = NAME.test(key) ? paramKind(p, b.layout[pointer]?.widget) : null;
    return {
      path,
      pointer,
      key,
      kind,
      reason: kind ? undefined : "parameter ชนิดที่ builder ไม่รู้จัก",
      props: paramProps(p, b.layout, pointer, kind),
      children: [],
    };
  });
  return { params, data: schemaFields(b.schema, [], b.layout, false) };
}

function allPointers(b: Builder): string[] {
  const out: string[] = [];
  const walk = (fields: BuilderField[]) =>
    fields.forEach((f) => {
      out.push(f.pointer);
      walk(f.children);
    });
  const tree = fieldTree(b);
  walk(tree.params);
  walk(tree.data);
  return out;
}

/** The field at a path, or null. */
export function findField(b: Builder, path: FieldPath): BuilderField | null {
  let list = fieldTree(b)[path.section];
  let found: BuilderField | null = null;
  for (const key of path.keys) {
    found = list.find((f) => f.key === key) ?? null;
    if (!found) return null;
    list = found.children;
  }
  return found;
}

// ---- immutable edits on the documents -------------------------------------------------------------

/** The object node holding the children of `keys` (a group's node, a table's item node, or the root). */
function containerAt(schema: Json, keys: string[]): Json | null {
  let cur: Json = schema;
  for (const key of keys) {
    const props = isObject(cur.properties) ? cur.properties : null;
    const next = props?.[key];
    if (!isObject(next)) return null;
    cur = next.type === "array" && isObject(next.items) ? next.items : next;
  }
  return cur;
}

/** A copy of `schema` with the container at `keys` replaced by fn(container). */
function updateContainer(schema: Json, keys: string[], fn: (c: Json) => Json): Json {
  if (keys.length === 0) return fn(schema);
  const [head, ...rest] = keys;
  const props = isObject(schema.properties) ? schema.properties : {};
  const child = props[head] as Json;
  const next =
    child.type === "array" && isObject(child.items)
      ? { ...child, items: updateContainer(child.items, rest, fn) }
      : updateContainer(child, rest, fn);
  return { ...schema, properties: { ...props, [head]: next } };
}

/** A copy of `obj` with `key` set, keeping the key's place (or appended / inserted at `index`). */
function withKey(obj: Json, key: string, value: unknown, index?: number): Json {
  const entries = Object.entries(obj).filter(([k]) => k !== key);
  const at = key in obj && index === undefined ? Object.keys(obj).indexOf(key) : (index ?? entries.length);
  entries.splice(Math.min(at, entries.length), 0, [key, value]);
  return Object.fromEntries(entries);
}

const without = (obj: Json, key: string): Json => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));

function setRequired(container: Json, key: string, on: boolean): Json {
  const list = Array.isArray(container.required) ? (container.required as unknown[]) : [];
  const has = list.includes(key);
  if (on === has) return container;
  const next = on ? [...list, key] : list.filter((k) => k !== key);
  return next.length || "required" in container ? { ...container, required: next } : container;
}

const layoutWith = (layout: Layout, pointer: string, patch: Partial<{ widget: Widget | null; width: Width }>): Layout => {
  const cur = { ...layout[pointer] };
  if ("widget" in patch) {
    if (patch.widget) cur.widget = patch.widget;
    else delete cur.widget;
  }
  if (patch.width) cur.width = patch.width;
  const rest = Object.fromEntries(Object.entries(layout).filter(([p]) => p !== pointer));
  return cur.widget || (cur.width && cur.width !== "full") ? { ...rest, [pointer]: cur } : rest;
};

// ---- add ------------------------------------------------------------------------------------------

/** The next free `fieldN` among the keys. */
export function nextKey(taken: Iterable<string>): string {
  const set = new Set(taken);
  for (let i = 1; ; i++) if (!set.has(`field${i}`)) return `field${i}`;
}

function newSchemaNode(kind: Kind): Json {
  const title = KIND_LABEL[kind];
  switch (kind) {
    case "text":
    case "textarea":
      return { title, type: "string" };
    case "number":
      return { title, type: "number" };
    case "money":
      return { title, type: "string", format: "decimal" };
    case "date":
      return { title, type: "string", format: "date" };
    case "choice":
      return { title, type: "string", enum: ["ตัวเลือก 1", "ตัวเลือก 2"] };
    case "checkbox":
      return { title, type: "boolean" };
    case "group":
      return { title, type: "object", properties: {} };
    case "table":
      return { title, type: "array", items: { type: "object", properties: {} } };
  }
}

function newParam(kind: Kind): Json | null {
  const title = KIND_LABEL[kind];
  switch (kind) {
    case "text":
    case "textarea":
      return { title, type: "string" };
    case "number":
      return { title, type: "integer" };
    case "money":
      return { title, type: "decimal" };
    case "date":
      return { title, type: "date" };
    case "choice":
      return { title, type: "enum", values: ["ตัวเลือก 1", "ตัวเลือก 2"] };
    case "checkbox":
      return { title, type: "boolean" };
    default:
      return null;
  }
}

const WIDGET_OF: Partial<Record<Kind, Widget>> = { textarea: "textarea", money: "money" };

/**
 * Add a field of `kind` inside `parent` (section root: keys []; a group or a table: its keys) at `index`.
 * Returns the new builder and the new field's path.
 */
export function addField(
  b: Builder,
  section: Section,
  parentKeys: string[],
  index: number,
  kind: Kind,
): Result<{ builder: Builder; path: FieldPath }> {
  if (section === "params") {
    if (parentKeys.length) return fail("parameters ไม่มีกลุ่ม");
    const node = newParam(kind);
    if (!node) return fail(`${KIND_LABEL[kind]} ใช้ใน "ข้อมูลเอกสาร" ไม่ได้`);
    const params = isObject(b.report.parameters) ? b.report.parameters : {};
    const key = nextKey(Object.keys(params));
    const path: FieldPath = { section, keys: [key] };
    const widget = WIDGET_OF[kind];
    return ok({
      builder: {
        ...b,
        report: withKey(b.report, "parameters", withKey(params, key, node, index)),
        layout: widget ? layoutWith(b.layout, pointerOf(path), { widget }) : b.layout,
      },
      path,
    });
  }
  const parent = parentKeys.length ? findField(b, { section, keys: parentKeys }) : null;
  if (parentKeys.length && (!parent || (parent.kind !== "group" && parent.kind !== "table"))) {
    return fail("วางได้เฉพาะในกลุ่มหรือตาราง");
  }
  if (parent?.kind === "table" && !SCALAR_KINDS.includes(kind)) return fail("คอลัมน์ในตารางต้องเป็นช่องธรรมดา (ไม่ใช่กลุ่มหรือตาราง)");
  const container = containerAt(b.schema, parentKeys);
  if (!container) return fail("ไม่พบตำแหน่งที่จะวาง");
  const key = nextKey(Object.keys(isObject(container.properties) ? container.properties : {}));
  const path: FieldPath = { section, keys: [...parentKeys, key] };
  const widget = WIDGET_OF[kind];
  const schema = updateContainer(b.schema, parentKeys, (c) => ({
    ...c,
    properties: withKey(isObject(c.properties) ? c.properties : {}, key, newSchemaNode(kind), index),
  }));
  return ok({
    builder: { ...b, schema, layout: widget ? layoutWith(b.layout, pointerOf(path), { widget }) : b.layout },
    path,
  });
}

// ---- properties -----------------------------------------------------------------------------------

/** Check a new or renamed key against its siblings; Thai message or null. */
export function keyProblem(key: string, siblings: Iterable<string>): string | null {
  if (!NAME.test(key)) return "key ต้องขึ้นต้นด้วยตัวอักษรอังกฤษหรือ _ และมีแค่ A-Z a-z 0-9 _";
  if (RESERVED.has(key)) return `"${key}" เป็นชื่อสงวน`;
  if (new Set(siblings).has(key)) return `มี "${key}" ในระดับนี้แล้ว`;
  return null;
}

function numberProp(value: string | undefined, name: string, integer: boolean): Result<unknown> {
  if (value === undefined || value.trim() === "") return ok(undefined);
  const v = value.trim();
  if (!(integer ? INTEGER : NUMBER).test(v)) return fail(integer ? `${name} ต้องเป็นจำนวนเต็มไม่ติดลบ` : `${name} ต้องเป็นตัวเลข`);
  return ok(exactNumber(v));
}

/** The JSON value of a default for a kind, from the text in the panel; undefined = no default. */
function defaultFor(kind: Kind, value: string | boolean | null | undefined, node: Json, isParam: boolean): Result<unknown> {
  if (value === null || value === undefined || value === "") return ok(undefined);
  if (kind === "checkbox") return typeof value === "boolean" ? ok(value) : fail("ค่าเริ่มต้นต้องเป็นใช่/ไม่ใช่");
  const v = String(value);
  switch (kind) {
    case "number": {
      const integer = isParam || node.type === "integer";
      return (integer ? /^-?\d+$/ : NUMBER).test(v.trim())
        ? ok(exactNumber(v.trim()))
        : fail(integer ? "ค่าเริ่มต้นต้องเป็นจำนวนเต็ม" : "ค่าเริ่มต้นต้องเป็นตัวเลข");
    }
    case "money":
      return DECIMAL.test(v.trim()) ? ok(v.trim()) : fail("ค่าเริ่มต้นต้องเป็นตัวเลข เช่น 1250.50");
    case "date":
      return DATE.test(v) ? ok(v) : fail("ค่าเริ่มต้นต้องเป็นวันที่ ปปปป-ดด-วว");
    case "choice": {
      const options = (isParam ? node.values : node.enum) as string[];
      return options.includes(v) ? ok(v) : fail("ค่าเริ่มต้นต้องเป็นหนึ่งในตัวเลือก");
    }
    default:
      return ok(v);
  }
}

function setOrDelete(node: Json, key: string, value: unknown): Json {
  return value === undefined ? without(node, key) : withKey(node, key, value);
}

/** Apply panel edits to one field; every check happens before anything changes. */
export function setProps(b: Builder, path: FieldPath, patch: FieldProps): Result<Builder> {
  const field = findField(b, path);
  if (!field) return fail("ไม่พบช่องนี้");
  if (!field.kind) return fail("ช่องนี้แก้ได้ใน JSON เท่านั้น");
  const kind = field.kind;
  const pointer = field.pointer;
  const isParam = path.section === "params";

  // layout
  let layout = b.layout;
  if (patch.width) layout = layoutWith(layout, pointer, { width: patch.width });
  if ("widget" in patch) {
    const allowed: Record<string, (Widget | null)[]> = {
      text: [null, "textarea"],
      textarea: [null, "textarea"],
      choice: [null, "radio"],
      money: [null, "money"],
    };
    if (!(allowed[kind] ?? [null]).includes(patch.widget ?? null)) return fail("ชนิด input นี้ใช้กับช่องนี้ไม่ได้");
    layout = layoutWith(layout, pointer, { widget: patch.widget ?? null });
  }

  const edit = (node: Json): Result<Json> => {
    let n = node;
    if ("label" in patch) {
      const label = patch.label?.trim();
      if (isParam && label && label.length > 80) return fail("ป้ายยาวได้ไม่เกิน 80 ตัวอักษร");
      n = setOrDelete(n, "title", label || undefined);
    }
    if ("description" in patch) {
      const d = patch.description?.trim();
      if (isParam && d && d.length > 300) return fail("คำอธิบายยาวได้ไม่เกิน 300 ตัวอักษร");
      n = setOrDelete(n, "description", d || undefined);
    }
    if ("integer" in patch && kind === "number" && !isParam) n = withKey(n, "type", patch.integer ? "integer" : "number");
    if ("options" in patch && kind === "choice") {
      const options = (patch.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (!options.length) return fail("ตัวเลือกต้องมีอย่างน้อย 1 ค่า");
      if (new Set(options).size !== options.length) return fail("ตัวเลือกซ้ำกัน");
      n = withKey(n, isParam ? "values" : "enum", options);
      const d = n.default;
      if (typeof d === "string" && !options.includes(d)) n = without(n, "default");
    }
    const ruleKeys = isParam
      ? (["maxLength"] as const)
      : (["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"] as const);
    for (const k of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"] as const) {
      if (!(k in patch)) continue;
      if (!(ruleKeys as readonly string[]).includes(k)) return fail(`${k} ใช้กับช่องนี้ไม่ได้`);
      const count = k !== "minimum" && k !== "maximum";
      const r = numberProp(patch[k], k, count);
      if (!r.ok) return r;
      if (count && isParam && r.value !== undefined && num(r.value) === 0) return fail("maxLength ต้องอย่างน้อย 1");
      n = setOrDelete(n, k, r.value);
    }
    if ("pattern" in patch) {
      if (isParam) return fail("pattern ใช้กับ parameter ไม่ได้");
      const p = patch.pattern ?? "";
      if (p) {
        try {
          new RegExp(p, "u");
        } catch {
          return fail("pattern ไม่ใช่ regex ที่อ่านได้");
        }
      }
      n = setOrDelete(n, "pattern", p || undefined);
    }
    if ("defaultValue" in patch) {
      const r = defaultFor(kind, patch.defaultValue, n, isParam);
      if (!r.ok) return r;
      if (isParam && r.value !== undefined && (patch.required ?? n.required === true)) {
        return fail("parameter ที่บังคับกรอกมีค่าเริ่มต้นไม่ได้");
      }
      n = setOrDelete(n, "default", r.value);
    }
    if (isParam && "required" in patch) {
      n = patch.required ? withKey(without(n, "default"), "required", true) : without(n, "required");
    }
    return ok(n);
  };

  if (isParam) {
    const params = b.report.parameters as Json;
    const r = edit(params[path.keys[0]] as Json);
    if (!r.ok) return r;
    return ok({ ...b, layout, report: withKey(b.report, "parameters", withKey(params, path.keys[0], r.value)) });
  }
  const parentKeys = path.keys.slice(0, -1);
  const key = path.keys[path.keys.length - 1];
  let error: string | null = null;
  const schema = updateContainer(b.schema, parentKeys, (c) => {
    const props = c.properties as Json;
    const r = edit(props[key] as Json);
    if (!r.ok) {
      error = r.error;
      return c;
    }
    const next = { ...c, properties: withKey(props, key, r.value) };
    return "required" in patch ? setRequired(next, key, patch.required === true) : next;
  });
  if (error) return fail(error);
  return ok({ ...b, layout, schema });
}
