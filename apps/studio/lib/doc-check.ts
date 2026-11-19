// Custom Code guard (SPEC-studio.md "v1.7"): the modal refuses to close on Jinja or HTML that would break the
// template — unpaired tags, unclosed delimiters, Jinja tags that do not exist. Names of variables and filters
// are left to validateDraft after saving (it knows the data).

import { JINJA_TAGS, parse, tokenize, type Node } from "./doc-parse";

export type CheckProblem = { line: number; message: string };

const lineOf = (src: string, at: number) => src.slice(0, at).split("\n").length;
const closer = { expr: "}}", stmt: "%}", comment: "#}" } as const;

/** Problems in a piece of template, in source order; empty when it is safe to keep. */
export function checkCode(src: string): CheckProblem[] {
  const out: { at: number; message: string }[] = [];
  for (const t of tokenize(src)) {
    if (t.type === "expr" || t.type === "stmt" || t.type === "comment") {
      const close = closer[t.type];
      if (!src.slice(t.start, t.end).endsWith(close) || t.end - t.start < 4) {
        out.push({ at: t.start, message: `${src.slice(t.start, t.start + 2)} ไม่ได้ปิดด้วย ${close}` });
      }
    }
    if (t.type === "stmt" && t.keyword && !JINJA_TAGS.has(t.keyword)) {
      out.push({ at: t.start, message: `ไม่รู้จักแท็ก {% ${t.keyword} %}` });
    }
    if (t.type === "stmt" && !t.keyword) out.push({ at: t.start, message: "แท็ก {% %} ว่าง" });
  }
  const walk = (n: Node) => {
    switch (n.kind) {
      case "stray": {
        const t = n.token;
        const what = t.type === "close" ? `</${t.name}>` : t.type === "stmt" ? `{% ${t.keyword} %}` : "แท็ก";
        out.push({ at: n.start, message: `${what} ไม่มีตัวเปิดที่คู่กัน` });
        break;
      }
      case "element":
        if (n.broken && !n.close) out.push({ at: n.start, message: `<${n.name}> ไม่ได้ปิด (หรือปิดผิดลำดับ)` });
        n.children.forEach(walk);
        break;
      case "block":
        if (n.broken && !n.close) out.push({ at: n.start, message: `{% ${n.keyword} %} ไม่มี {% end${n.keyword} %}` });
        n.branches.forEach((b) => b.children.forEach(walk));
        break;
      case "root":
        n.children.forEach(walk);
        break;
    }
  };
  walk(parse(src));
  return out
    .sort((a, b) => a.at - b.at)
    .filter((p, i, all) => i === 0 || p.at !== all[i - 1].at || p.message !== all[i - 1].message)
    .map((p) => ({ line: lineOf(src, p.at), message: p.message }));
}
