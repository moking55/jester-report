import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { fieldRefs, references, type FieldRef } from "@/lib/field-refs";

const STARTERS = join(__dirname, "../../api/src/jester_api/template_store/starters");
const starter = (name: string): Record<string, string> =>
  Object.fromEntries(readdirSync(join(STARTERS, name)).map((f) => [f, readFileSync(join(STARTERS, name, f), "utf8")]));

function refs(files: Record<string, string>) {
  const r = fieldRefs(files);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
const flat = (list: FieldRef[]): FieldRef[] => list.flatMap((f) => [f, ...flat(f.children)]);
const byPointer = (files: Record<string, string>) => {
  const r = refs(files);
  return Object.fromEntries(flat([...r.params, ...r.data]).map((f) => [f.pointer, f]));
};

describe("field refs", () => {
  it("gives quotation's expressions: params, groups, the list loop and its columns, fmt for money and dates", () => {
    const f = byPointer(starter("quotation"));
    expect(f["/params/quoteId"].expression).toBe("{{ params.quoteId }}");
    expect(f["/params/docDate"].expression).toBe("{{ fmt.thai_date(params.docDate) }}");
    expect(f["/data/customer/name"].expression).toBe("{{ data.customer.name }}");
    expect(f["/data/items"].expression).toBe("{% for item in lists.items %}…{% endfor %}");
    expect(f["/data/items/unitPrice"].expression).toBe("{{ fmt.money(item.unitPrice) }}");
    expect(f["/data/customer/name"].label).toBe("ชื่อลูกค้า");
  });

  it("loops a child list through its parent row", () => {
    const f = byPointer(starter("purchase-order"));
    expect(f["/data/orders"].expression).toBe("{% for item in lists.orders %}…{% endfor %}");
    expect(f["/data/orders/details"].expression).toBe("{% for row in item.details %}…{% endfor %}");
    expect(f["/data/orders/details"].kind).toBe("table"); // a table in a table is read as a table (v1.8, up to 3 deep)
  });

  it("loops a table that no list uses over data", () => {
    const files = starter("blank");
    files["data.schema.json"] = JSON.stringify({
      type: "object",
      properties: { lines: { type: "array", items: { type: "object", properties: { qty: { type: "integer" } } } } },
    });
    const f = byPointer(files);
    expect(f["/data/lines"].expression).toBe("{% for item in data.lines %}…{% endfor %}");
    expect(f["/data/lines/qty"].expression).toBe("{{ item.qty }}");
  });

  it("marks fields that no template or expression mentions, never groups or tables", () => {
    for (const name of ["quotation", "tax-invoice", "purchase-order", "sales-grouped"]) {
      // every starter uses its data fields (some parameters, like locale/currency, are only passed through)
      expect(flat(refs(starter(name)).data).filter((f) => f.unused).map((f) => f.pointer)).toEqual([]);
    }
    const files = starter("blank");
    files["template.html"] = files["template.html"].replace(/data\.title/g, "'x'");
    expect(byPointer(files)["/data/title"].unused).toBe(true);
    // a key is matched by name anywhere (.name of company counts for customer.name too): a hint, not a rule
    expect(byPointer(starter("quotation"))["/data/customer"].unused).toBe(false);
  });

  it("counts qty in a computed expression and ['key'] access as used", () => {
    const files = starter("quotation");
    files["template.html"] = files["template.html"].replace(/item\.qty/g, "item['qty']");
    expect(byPointer(files)["/data/items/qty"].unused).toBe(false);
    expect(references(files, { section: "data", keys: ["items", "qty"] })).toEqual(["template.html", "report.json"]);
  });

  it("names the files that use a field before rename or remove", () => {
    expect(references(starter("quotation"), { section: "data", keys: ["customer"] })).toEqual(["template.html"]);
    expect(references(starter("quotation"), { section: "params", keys: ["nothing"] })).toEqual([]);
  });
});
