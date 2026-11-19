import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { checkCode } from "@/lib/doc-check";

const STARTERS = join(__dirname, "../../api/src/jester_api/template_store/starters");

describe("Custom Code guard", () => {
  it("passes every starter and good code", () => {
    for (const name of readdirSync(STARTERS)) {
      expect(checkCode(readFileSync(join(STARTERS, name, "template.html"), "utf8"))).toEqual([]);
    }
    expect(checkCode("{% if a %}<b>{{ x }}</b>{% elif b %}y{% else %}z{% endif %}{% set n = 1 %}")).toEqual([]);
  });

  it("names the line of an unclosed if, an endfor without for, an unclosed element", () => {
    expect(checkCode("<p>a</p>\n{% if x %}\n<p>b</p>")).toEqual([{ line: 2, message: "{% if %} ไม่มี {% endif %}" }]);
    expect(checkCode("x\n{% endfor %}")).toEqual([{ line: 2, message: "{% endfor %} ไม่มีตัวเปิดที่คู่กัน" }]);
    expect(checkCode("<div>\n<span>a</div>")).toEqual([{ line: 2, message: "<span> ไม่ได้ปิด (หรือปิดผิดลำดับ)" }]);
    expect(checkCode("<p>a</p></div>")).toEqual([{ line: 1, message: "</div> ไม่มีตัวเปิดที่คู่กัน" }]);
  });

  it("names unclosed delimiters and unknown tags", () => {
    expect(checkCode("{{ data.x")[0].message).toBe("{{ ไม่ได้ปิดด้วย }}");
    expect(checkCode("{% iff x %}")[0].message).toBe("ไม่รู้จักแท็ก {% iff %}");
    expect(checkCode("a {# note")[0].message).toBe("{# ไม่ได้ปิดด้วย #}");
  });
});
