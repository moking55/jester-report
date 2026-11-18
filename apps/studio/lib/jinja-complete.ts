// Autocomplete inside {{ … }} and {% … %} of template files: the context the binder gives a template
// (params, data, lists, totals, meta, fmt), the fmt helpers, and names read from the draft's report.json.

export type Suggestion = { label: string; type: string; detail?: string; info?: string; apply?: string };

// keep in step with apps/api/src/jester_api/data_prep/formatters.py FORMATTERS
export const FMT: Suggestion[] = [
  { label: "money", type: "function", detail: "(value, places=2)", info: "1,234.50", apply: "money(" },
  { label: "number", type: "function", detail: "(value, places=0)", info: "1,235", apply: "number(" },
  { label: "thai_date", type: "function", detail: "(value)", info: "18 พฤศจิกายน 2569", apply: "thai_date(" },
  { label: "thai_date_short", type: "function", detail: "(value)", info: "18 พ.ย. 69", apply: "thai_date_short(" },
  { label: "baht_text", type: "function", detail: "(value)", info: "หนึ่งพันบาทถ้วน", apply: "baht_text(" },
];

const ROOTS: Suggestion[] = [
  { label: "params", type: "variable", info: "parameters of the request (report.json parameters)" },
  { label: "data", type: "variable", info: "the request data" },
  { label: "lists", type: "variable", info: "lists from report.json, with computed fields" },
  { label: "totals", type: "variable", info: "totals from report.json" },
  { label: "meta", type: "variable", info: "templateId, version, renderedAt" },
  { label: "fmt", type: "namespace", info: "money, number, thai_date, thai_date_short, baht_text" },
];

const TAGS = ["for", "endfor", "if", "elif", "else", "endif", "set"].map((label) => ({ label, type: "keyword" }));
const META = ["templateId", "version", "renderedAt"].map((label) => ({ label, type: "property" }));

/** Names of params, lists and totals in report.json; nothing when it does not parse yet. */
export function reportNames(reportJson: string | undefined): Record<"params" | "lists" | "totals", string[]> {
  try {
    const report = JSON.parse(reportJson ?? "") as Record<string, unknown>;
    const keys = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : []);
    return { params: keys(report.parameters), lists: keys(report.lists), totals: keys(report.totals) };
  } catch {
    return { params: [], lists: [], totals: [] };
  }
}

/**
 * What to offer at the end of `before` (the text from the start of the file to the cursor), or null when
 * the cursor is not inside a Jinja tag. `from` is how many characters back the replaced word starts.
 */
export function suggest(before: string, reportJson?: string): { back: number; options: Suggestion[] } | null {
  const open = Math.max(before.lastIndexOf("{{"), before.lastIndexOf("{%"));
  if (open < 0 || Math.max(before.lastIndexOf("}}"), before.lastIndexOf("%}")) > open) return null;
  const inside = before.slice(open + 2);
  const word = /[A-Za-z_][\w.]*$|$/.exec(inside)![0];
  const dot = word.lastIndexOf(".");
  if (dot < 0) {
    const statement = before.startsWith("{%", open) && /^\s*\w*$/.test(inside);
    return { back: word.length, options: statement ? TAGS : ROOTS };
  }
  const head = word.slice(0, dot);
  const back = word.length - dot - 1;
  const names = reportNames(reportJson);
  const named = (list: string[], type: string) => list.map((label) => ({ label, type }));
  if (head === "fmt") return { back, options: FMT };
  if (head === "meta") return { back, options: META };
  if (head === "params") return { back, options: named(names.params, "property") };
  if (head === "lists") return { back, options: named(names.lists, "property") };
  if (head === "totals") return { back, options: named(names.totals, "property") };
  return null;
}
