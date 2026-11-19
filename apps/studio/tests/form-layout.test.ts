import { describe, expect, it } from "vitest";

import { readLayout, staleLayout, writeLayout } from "@/lib/form-layout";

describe("form.json", () => {
  it("is empty without a file", () => {
    expect(readLayout(undefined)).toEqual({ fields: {}, warnings: [] });
  });

  it("reads widgets and widths by pointer", () => {
    const text = JSON.stringify({
      formVersion: 1,
      fields: {
        "/params/note": { widget: "textarea" },
        "/data/customer/taxId": { width: "half" },
        "/data/items/unitPrice": { widget: "money", width: "third" },
      },
    });
    expect(readLayout(text)).toEqual({
      fields: {
        "/params/note": { widget: "textarea" },
        "/data/customer/taxId": { width: "half" },
        "/data/items/unitPrice": { widget: "money", width: "third" },
      },
      warnings: [],
    });
  });

  it("skips a broken file or a wrong version with a warning, never throws", () => {
    for (const text of ["{oops", "[]", JSON.stringify({ formVersion: 2, fields: { "/data/a": { width: "half" } } })]) {
      const { fields, warnings } = readLayout(text);
      expect(fields).toEqual({});
      expect(warnings).toHaveLength(1);
    }
  });

  it("skips unknown pointers and values, keeps the rest", () => {
    const text = JSON.stringify({
      formVersion: 1,
      fields: {
        "/other/x": { width: "half" },
        "/data/a": { widget: "slider", width: "half" },
        "/data/b": "half",
        "/data/c": { width: "huge" },
      },
    });
    const { fields, warnings } = readLayout(text);
    expect(fields).toEqual({ "/data/a": { width: "half" } });
    expect(warnings).toHaveLength(4);
  });

  it("writes in the form's order, drops stale pointers and defaults, nothing → no file", () => {
    const fields = {
      "/data/b": { widget: "textarea" as const, width: "full" as const },
      "/data/gone": { width: "half" as const },
      "/data/a": { width: "half" as const },
    };
    const text = writeLayout(fields, ["/data/a", "/data/b"]);
    expect(text).toBe(
      `${JSON.stringify({ formVersion: 1, fields: { "/data/a": { width: "half" }, "/data/b": { widget: "textarea" } } }, null, 2)}\n`,
    );
    expect(readLayout(text!).fields).toEqual({ "/data/a": { width: "half" }, "/data/b": { widget: "textarea" } });
    expect(writeLayout({ "/data/a": { width: "full" } }, ["/data/a"])).toBeNull();
    expect(staleLayout(fields, ["/data/a", "/data/b"])).toEqual(["/data/gone"]);
  });
});
