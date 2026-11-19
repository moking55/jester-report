// The issue form (SPEC-studio.md "v1.4"): fields from report.json parameters and data.schema.json of the
// published version, form values, checks in Thai, and the /v1/render body. Pure, so it is tested in Vitest.
//
// Values are kept as the text the user typed. The body is assembled from that text, never through
// JSON.parse + stringify of numbers, so 12345678901234567.89 reaches the api exactly (like lib/render.ts).

import { readLayout, type Layout, type Widget, type Width } from "./form-layout";

export type Scalar = "text" | "date" | "decimal" | "integer" | "number" | "enum" | "boolean" | "json";

// widget and width come from form.json (v1.6); absent → the v1.4 look
type Base = { key: string; label: string; description?: string; required: boolean; widget?: Widget; width?: Width };
export type ScalarField = Base & {
  kind: Scalar;
  options?: string[]; // enum
  defaultValue?: string | boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
};
export type ObjectField = Base & { kind: "object"; fields: Field[] };
export type ArrayField = Base & { kind: "array"; item: Field; minItems: number; maxItems?: number };
export type Field = ScalarField | ObjectField | ArrayField;

export type Value = string | boolean | Value[] | { [key: string]: Value };
export type FormSpec = { params: Field[]; data: Field }; // data is the root of data.schema.json
export type FormValues = { params: Record<string, Value>; data: Value };
export type Errors = Record<string, string>; // JSON pointer ("/params/x", "/data/items/0/qty") -> message

const DECIMAL = /^-?\d+(\.\d+)?$/;
const INTEGER = /^-?\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);

// ---- fields ---------------------------------------------------------------------------------------

function scalarFromSchema(schema: Json, key: string, label: string, required: boolean): Field {
  const base = { key, label, description: text(schema.description), required };
  const extra = {
    minLength: typeof schema.minLength === "number" ? schema.minLength : undefined,
    maxLength: typeof schema.maxLength === "number" ? schema.maxLength : undefined,
    pattern: typeof schema.pattern === "string" ? schema.pattern : undefined,
    minimum: typeof schema.minimum === "number" ? schema.minimum : undefined,
    maximum: typeof schema.maximum === "number" ? schema.maximum : undefined,
  };
  const def = schema.default;
  const types = Array.isArray(schema.type) ? schema.type.filter((t) => t !== "null") : [schema.type];
  const type = types.length === 1 ? types[0] : types.length === 0 ? undefined : "many";
  if (Array.isArray(schema.enum)) {
    return schema.enum.every((v) => typeof v === "string")
      ? { ...base, kind: "enum", options: schema.enum as string[], defaultValue: typeof def === "string" ? def : undefined }
      : { ...base, kind: "json" };
  }
  if (type === "string") {
    const kind = schema.format === "date" ? "date" : schema.format === "decimal" ? "decimal" : "text";
    return { ...base, ...extra, kind, defaultValue: typeof def === "string" ? def : undefined };
  }
  if (type === "integer" || type === "number") {
    const kind = type === "integer" ? "integer" : "number";
    return { ...base, ...extra, kind, defaultValue: typeof def === "number" ? String(def) : undefined };
  }
  if (type === "boolean") return { ...base, kind: "boolean", defaultValue: typeof def === "boolean" ? def : undefined };
  return { ...base, kind: "json" };
}

/** One field for a schema node; anything the form does not handle becomes a raw JSON box, never a crash. */
export function fieldFromSchema(schema: unknown, key: string, required = false): Field {
  const node = isObject(schema) ? schema : {};
  const label = text(node.title) ?? key;
  const unsupported = ["oneOf", "anyOf", "allOf", "$ref", "not", "if"].some((k) => k in node);
  if (unsupported) return { key, label, description: text(node.description), required, kind: "json" };
  if (node.type === "object" && isObject(node.properties)) {
    const req = new Set(Array.isArray(node.required) ? node.required : []);
    const fields = Object.entries(node.properties).map(([k, v]) => fieldFromSchema(v, k, req.has(k)));
    return { key, label, description: text(node.description), required, kind: "object", fields };
  }
  if (node.type === "array" && isObject(node.items)) {
    return {
      key,
      label,
      description: text(node.description),
      required,
      kind: "array",
      item: fieldFromSchema(node.items, "", true),
      minItems: typeof node.minItems === "number" ? node.minItems : 0,
      maxItems: typeof node.maxItems === "number" ? node.maxItems : undefined,
    };
  }
  return scalarFromSchema(node, key, label, required);
}

const PARAM_KIND: Record<string, Scalar> = {
  string: "text",
  date: "date",
  decimal: "decimal",
  integer: "integer",
  enum: "enum",
  boolean: "boolean",
};

/** A copy of `field` (and its children) with the widget and width form.json gives its pointer. */
function withLayout(field: Field, pointer: string, layout: Layout): Field {
  const own = layout[pointer] ?? {};
  const out = { ...field, ...(own.widget ? { widget: own.widget } : {}), ...(own.width ? { width: own.width } : {}) };
  if (out.kind === "object") return { ...out, fields: out.fields.map((f) => withLayout(f, `${pointer}/${f.key}`, layout)) };
  if (out.kind === "array") {
    // columns are keyed by the array's pointer and the column, without a row number
    const item = out.item.kind === "object"
      ? { ...out.item, fields: out.item.fields.map((f) => withLayout(f, `${pointer}/${f.key}`, layout)) }
      : out.item;
    return { ...out, item };
  }
  return out;
}

/** The form for a version: its report.json parameters, data.schema.json and form.json (v1.6, optional). */
export function formSpec(reportJson: string, schemaJson: string, formJson?: string): FormSpec {
  const report = JSON.parse(reportJson) as Json;
  const parameters = isObject(report.parameters) ? report.parameters : {};
  const params: Field[] = Object.entries(parameters).map(([key, raw]) => {
    const p = isObject(raw) ? raw : {};
    const kind = PARAM_KIND[String(p.type)] ?? "json";
    const def = p.default;
    return {
      key,
      label: text(p.title) ?? key,
      description: text(p.description),
      required: p.required === true,
      kind,
      options: Array.isArray(p.values) ? (p.values as string[]) : undefined,
      maxLength: typeof p.maxLength === "number" ? p.maxLength : undefined,
      defaultValue:
        typeof def === "boolean" ? def : typeof def === "number" ? String(def) : typeof def === "string" ? def : undefined,
    };
  });
  const layout = readLayout(formJson).fields;
  return {
    params: params.map((f) => withLayout(f, `/params/${f.key}`, layout)),
    data: withLayout(fieldFromSchema(JSON.parse(schemaJson), "data", true), "/data", layout),
  };
}

/** How a money field shows a valid decimal when it is not being typed in: "1250.5" → "1,250.50". */
export function moneyDisplay(value: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return value;
  const [, sign, whole, frac = ""] = m;
  return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac.padEnd(2, "0")}`;
}

// ---- values ---------------------------------------------------------------------------------------

/** An empty form: only `default` values (SPEC: the form opens empty). */
export function emptyValue(field: Field): Value {
  if (field.kind === "object") return Object.fromEntries(field.fields.map((f) => [f.key, emptyValue(f)]));
  if (field.kind === "array") return Array.from({ length: field.minItems }, () => emptyValue(field.item));
  if (field.kind === "boolean") return field.defaultValue === true;
  return typeof field.defaultValue === "string" ? field.defaultValue : "";
}

export function emptyValues(spec: FormSpec): FormValues {
  return { params: Object.fromEntries(spec.params.map((f) => [f.key, emptyValue(f)])), data: emptyValue(spec.data) };
}

/** Form values from a sample's JSON text ("ใช้ข้อมูลตัวอย่าง"); numbers keep the digits written in the file. */
export function valueFromJson(field: Field, value: unknown, raw?: string): Value {
  if (field.kind === "object") {
    const obj = isObject(value) ? value : {};
    return Object.fromEntries(field.fields.map((f) => [f.key, valueFromJson(f, obj[f.key])]));
  }
  if (field.kind === "array") {
    return Array.isArray(value) ? value.map((v) => valueFromJson(field.item, v)) : emptyValue(field);
  }
  if (value === undefined || value === null) return emptyValue(field);
  if (field.kind === "boolean") return value === true;
  if (field.kind === "json") return raw ?? JSON.stringify(value, null, 2);
  return typeof value === "string" ? value : String(value);
}

export function sampleValues(spec: FormSpec, sampleJson: string): FormValues {
  return { params: emptyValues(spec).params, data: valueFromJson(spec.data, JSON.parse(sampleJson)) };
}

// ---- checks ---------------------------------------------------------------------------------------

const isEmpty = (v: Value | undefined) => v === undefined || v === "" || (typeof v === "string" && !v.trim());

function checkScalar(field: ScalarField, value: Value | undefined): string | null {
  if (field.kind === "boolean") return null;
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return field.required ? "กรุณากรอกช่องนี้" : null;
  switch (field.kind) {
    case "date":
      return DATE.test(v) ? null : "วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว";
    case "decimal":
      return DECIMAL.test(v) ? null : "ใส่ตัวเลข เช่น 1250.50 (ไม่ใส่จุลภาค)";
    case "integer":
    case "number": {
      if (!(field.kind === "integer" ? INTEGER : DECIMAL).test(v)) {
        return field.kind === "integer" ? "ใส่จำนวนเต็ม" : "ใส่ตัวเลข";
      }
      const n = Number(v);
      if (field.minimum !== undefined && n < field.minimum) return `ต้องไม่น้อยกว่า ${field.minimum}`;
      if (field.maximum !== undefined && n > field.maximum) return `ต้องไม่เกิน ${field.maximum}`;
      return null;
    }
    case "enum":
      return field.options?.includes(v) ? null : "เลือกจากรายการ";
    case "json":
      try {
        JSON.parse(v);
        return null;
      } catch {
        return "ต้องเป็น JSON ที่ถูกต้อง";
      }
    default: {
      if (field.minLength !== undefined && v.length < field.minLength) return `ต้องยาวอย่างน้อย ${field.minLength} ตัวอักษร`;
      if (field.maxLength !== undefined && v.length > field.maxLength) return `ยาวได้ไม่เกิน ${field.maxLength} ตัวอักษร`;
      if (field.pattern !== undefined) {
        try {
          if (!new RegExp(field.pattern, "u").test(v)) return "รูปแบบไม่ถูกต้อง";
        } catch {
          return null; // a pattern JavaScript cannot read: leave it to the api
        }
      }
      return null;
    }
  }
}

function check(field: Field, value: Value | undefined, pointer: string, errors: Errors): void {
  if (field.kind === "object") {
    const obj = isObject(value) ? (value as Record<string, Value>) : {};
    for (const f of field.fields) check(f, obj[f.key], `${pointer}/${f.key}`, errors);
    return;
  }
  if (field.kind === "array") {
    const rows = Array.isArray(value) ? value : [];
    if (rows.length < field.minItems) errors[pointer] = `ต้องมีอย่างน้อย ${field.minItems} แถว`;
    else if (field.maxItems !== undefined && rows.length > field.maxItems) errors[pointer] = `มีได้ไม่เกิน ${field.maxItems} แถว`;
    rows.forEach((row, i) => check(field.item, row, `${pointer}/${i}`, errors));
    return;
  }
  const message = checkScalar(field, value);
  if (message) errors[pointer] = message;
}

/** Problems the form can find itself, by JSON pointer; the api checks the rest. */
export function validate(spec: FormSpec, values: FormValues): Errors {
  const errors: Errors = {};
  for (const f of spec.params) check(f, values.params[f.key], `/params/${f.key}`, errors);
  check(spec.data, values.data, "/data", errors);
  return errors;
}

/** The field to show an api problem at: the pointer itself, or its nearest parent the form has. */
export function fieldPointer(pointer: string, known: Iterable<string>): string | null {
  const set = new Set(known);
  for (let p = pointer; p; p = p.slice(0, p.lastIndexOf("/"))) if (set.has(p)) return p;
  return null;
}

/** Every pointer the form shows, for fieldPointer. */
export function pointers(spec: FormSpec, values: FormValues): string[] {
  const out: string[] = [];
  const walk = (field: Field, value: Value | undefined, pointer: string) => {
    out.push(pointer);
    if (field.kind === "object") {
      const obj = isObject(value) ? (value as Record<string, Value>) : {};
      for (const f of field.fields) walk(f, obj[f.key], `${pointer}/${f.key}`);
    } else if (field.kind === "array" && Array.isArray(value)) {
      value.forEach((row, i) => walk(field.item, row, `${pointer}/${i}`));
    }
  };
  for (const f of spec.params) walk(f, values.params[f.key], `/params/${f.key}`);
  walk(spec.data, values.data, "/data");
  return out;
}

// ---- body -----------------------------------------------------------------------------------------

/** JSON text of a value, or undefined to leave an optional, empty field out. */
function json(field: Field, value: Value | undefined): string | undefined {
  if (field.kind === "object") {
    const obj = isObject(value) ? (value as Record<string, Value>) : {};
    const parts = field.fields.flatMap((f) => {
      const v = json(f, obj[f.key]);
      return v === undefined ? [] : [`${JSON.stringify(f.key)}:${v}`];
    });
    return parts.length || field.required ? `{${parts.join(",")}}` : undefined;
  }
  if (field.kind === "array") {
    const rows = Array.isArray(value) ? value : [];
    return rows.length || field.required ? `[${rows.map((r) => json(field.item, r) ?? "null").join(",")}]` : undefined;
  }
  if (field.kind === "boolean") return value === true ? "true" : field.required || value === false ? "false" : undefined;
  if (isEmpty(value) || typeof value !== "string") return undefined;
  const v = value.trim();
  if (field.kind === "integer" || field.kind === "number") return v; // checked by validate: digits only
  if (field.kind === "json") return v;
  return JSON.stringify(field.kind === "date" || field.kind === "decimal" || field.kind === "enum" ? v : value);
}

/** The /v1/render body for the published version. Call validate first: this trusts the values. */
export function renderBody(templateId: string, spec: FormSpec, values: FormValues, filename = ""): string {
  const params = spec.params.flatMap((f) => {
    const v = json(f, values.params[f.key]);
    return v === undefined ? [] : [`${JSON.stringify(f.key)}:${v}`];
  });
  const data = json({ ...spec.data, required: true }, values.data) ?? "{}";
  const name = filename.trim() ? `,"filename":${JSON.stringify(filename.trim())}` : "";
  const template = `{"id":${JSON.stringify(templateId)},"version":"published"}`;
  return `{"template":${template},"params":{${params.join(",")}},"data":${data}${name}}`;
}
