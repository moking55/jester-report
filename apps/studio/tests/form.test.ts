import { describe, expect, it } from "vitest";

import {
  emptyValues,
  fieldFromSchema,
  fieldPointer,
  formSpec,
  pointers,
  renderBody,
  sampleValues,
  validate,
  type ArrayField,
  type FormValues,
  type ObjectField,
} from "@/lib/form";

const REPORT = JSON.stringify({
  parameters: {
    invoiceNo: { type: "string", required: true, maxLength: 10, title: "เลขที่", description: "เช่น INV-1" },
    issueDate: { type: "date", required: true, title: "วันที่ออก" },
    copies: { type: "integer", default: 1 },
    lang: { type: "enum", values: ["th", "en"], default: "th", title: "ภาษา" },
    note: { type: "string" },
  },
});
const SCHEMA = JSON.stringify({
  type: "object",
  required: ["buyer", "items"],
  properties: {
    buyer: {
      title: "ผู้ซื้อ",
      type: "object",
      required: ["name"],
      properties: {
        name: { title: "ชื่อผู้ซื้อ", type: "string", minLength: 1 },
        taxId: { title: "เลขผู้เสียภาษี", type: "string", pattern: "^[0-9]{13}$" },
      },
    },
    items: {
      title: "รายการ",
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["qty", "unitPrice"],
        properties: {
          qty: { title: "จำนวน", type: "integer", minimum: 1 },
          unitPrice: { title: "ราคา", type: "string", format: "decimal" },
          unit: { title: "หน่วย", enum: ["ชิ้น", "งาน"] },
        },
      },
    },
    vatIncluded: { title: "รวมภาษีแล้ว", type: "boolean" },
    extra: { title: "อื่น ๆ", oneOf: [{ type: "string" }, { type: "number" }] },
  },
});
const spec = formSpec(REPORT, SCHEMA);
const data = spec.data as ObjectField;

function filled(): FormValues {
  const values = emptyValues(spec);
  values.params = { ...values.params, invoiceNo: "INV-1", issueDate: "2026-11-18" };
  values.data = {
    buyer: { name: "บริษัท ก", taxId: "" },
    items: [
      { qty: "2", unitPrice: "12345678901234567.89", unit: "ชิ้น" },
      { qty: "1", unitPrice: "0.10", unit: "" },
    ],
    vatIncluded: false,
    extra: "",
  };
  return values;
}

describe("formSpec", () => {
  it("labels from title, description and default, in schema order", () => {
    expect(spec.params.map((f) => [f.key, f.label, f.kind, f.required])).toEqual([
      ["invoiceNo", "เลขที่", "text", true],
      ["issueDate", "วันที่ออก", "date", true],
      ["copies", "copies", "integer", false],
      ["lang", "ภาษา", "enum", false],
      ["note", "note", "text", false],
    ]);
    expect(spec.params[0].description).toBe("เช่น INV-1");
    expect(data.fields.map((f) => [f.key, f.kind])).toEqual([
      ["buyer", "object"],
      ["items", "array"],
      ["vatIncluded", "boolean"],
      ["extra", "json"],
    ]);
    const items = data.fields[1] as ArrayField;
    expect(items.minItems).toBe(1);
    expect((items.item as ObjectField).fields.map((f) => f.kind)).toEqual(["integer", "decimal", "enum"]);
  });

  it("turns what it does not handle into a JSON box", () => {
    expect(fieldFromSchema({ $ref: "#/x" }, "a").kind).toBe("json");
    expect(fieldFromSchema({ type: ["string", "integer"] }, "a").kind).toBe("json");
    expect(fieldFromSchema({ enum: [1, 2] }, "a").kind).toBe("json");
    expect(fieldFromSchema({ type: ["string", "null"], format: "date" }, "a").kind).toBe("date");
  });
});

describe("values", () => {
  it("open empty with defaults and the minimum rows", () => {
    const values = emptyValues(spec);
    expect(values.params).toEqual({ invoiceNo: "", issueDate: "", copies: "1", lang: "th", note: "" });
    expect((values.data as { items: unknown[] }).items).toHaveLength(1);
  });

  it("fill from a sample keeping the written digits", () => {
    const sample = JSON.stringify({ buyer: { name: "ก" }, items: [{ qty: 3, unitPrice: "1250.50" }], extra: { a: 1 } });
    const values = sampleValues(spec, sample);
    expect(values.data).toEqual({
      buyer: { name: "ก", taxId: "" },
      items: [{ qty: "3", unitPrice: "1250.50", unit: "" }],
      vatIncluded: false,
      extra: '{\n  "a": 1\n}',
    });
  });
});

describe("validate", () => {
  it("passes a filled form", () => {
    expect(validate(spec, filled())).toEqual({});
  });

  it("finds each rule at its pointer, in Thai", () => {
    const values = filled();
    values.params.invoiceNo = "";
    values.params.issueDate = "18/11/2026";
    values.params.copies = "1.5";
    values.params.note = "x".repeat(5);
    const d = values.data as Record<string, never>;
    (d as Record<string, unknown>).buyer = { name: "", taxId: "123" };
    (d as Record<string, unknown>).items = [{ qty: "0", unitPrice: "1,250.50", unit: "กล่อง" }];
    (d as Record<string, unknown>).extra = "{ broken";
    expect(validate(spec, values)).toEqual({
      "/params/invoiceNo": "กรุณากรอกช่องนี้",
      "/params/issueDate": "วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว",
      "/params/copies": "ใส่จำนวนเต็ม",
      "/data/buyer/name": "กรุณากรอกช่องนี้",
      "/data/buyer/taxId": "รูปแบบไม่ถูกต้อง",
      "/data/items/0/qty": "ต้องไม่น้อยกว่า 1",
      "/data/items/0/unitPrice": "ใส่ตัวเลข เช่น 1250.50 (ไม่ใส่จุลภาค)",
      "/data/items/0/unit": "เลือกจากรายการ",
      "/data/extra": "ต้องเป็น JSON ที่ถูกต้อง",
    });
  });

  it("counts table rows", () => {
    const values = filled();
    (values.data as Record<string, unknown>).items = [];
    expect(validate(spec, values)["/data/items"]).toBe("ต้องมีอย่างน้อย 1 แถว");
  });
});

describe("renderBody", () => {
  it("keeps every digit and leaves empty optional fields out", () => {
    const body = renderBody("tax", spec, filled(), "ใบ 1.pdf");
    expect(body).toBe(
      '{"template":{"id":"tax","version":"published"},' +
        '"params":{"invoiceNo":"INV-1","issueDate":"2026-11-18","copies":1,"lang":"th"},' +
        '"data":{"buyer":{"name":"บริษัท ก"},"items":[{"qty":2,"unitPrice":"12345678901234567.89","unit":"ชิ้น"},' +
        '{"qty":1,"unitPrice":"0.10"}],"vatIncluded":false},"filename":"ใบ 1.pdf"}',
    );
    expect(() => JSON.parse(body)).not.toThrow();
  });

  it("puts a JSON box in as written", () => {
    const values = filled();
    (values.data as Record<string, unknown>).extra = '{"a": 12345678901234567.89}';
    expect(renderBody("tax", spec, values)).toContain('"extra":{"a": 12345678901234567.89}');
  });
});

describe("pointers from the api", () => {
  it("land on the field, or its nearest parent the form shows", () => {
    const known = pointers(spec, filled());
    expect(fieldPointer("/data/items/1/unitPrice", known)).toBe("/data/items/1/unitPrice");
    expect(fieldPointer("/data/items/1/nope", known)).toBe("/data/items/1");
    expect(fieldPointer("/params/issueDate", known)).toBe("/params/issueDate");
    expect(fieldPointer("/filename", known)).toBeNull();
  });
});
