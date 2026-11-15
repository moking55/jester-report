// Starting params for Preview and Prepared data: every required parameter of report.json gets a value of
// its type, so the first Preview shows a PDF instead of PARAM_REQUIRED. The user edits the JSON after that.
const SAMPLE: Record<string, (today: string) => unknown> = {
  string: () => "SAMPLE",
  integer: () => 1,
  decimal: () => "1",
  boolean: () => false,
  date: (today) => today,
};

type Spec = { type?: string; required?: boolean; values?: unknown[] };

export function defaultParams(reportJson: string | undefined, today: string): string {
  let parameters: Record<string, Spec> = {};
  try {
    const parsed = JSON.parse(reportJson ?? "{}") as { parameters?: Record<string, Spec> };
    if (parsed && typeof parsed.parameters === "object" && parsed.parameters) parameters = parsed.parameters;
  } catch {
    // a broken report.json: Validate reports it; start with no params
  }
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(parameters)) {
    if (!spec?.required) continue;
    if (spec.type === "enum") out[name] = spec.values?.[0] ?? "";
    else if (spec.type && SAMPLE[spec.type]) out[name] = SAMPLE[spec.type](today);
  }
  return JSON.stringify(out);
}

/** The params box as an object; a message when it is not a JSON object. */
export function parseParams(text: string): { params: Record<string, unknown> } | { error: string } {
  if (!text.trim()) return { params: {} };
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return { params: value as Record<string, unknown> };
  } catch {
    // fall through
  }
  return { error: 'params ต้องเป็น JSON object เช่น {"quoteId": "Q-1"}' };
}
