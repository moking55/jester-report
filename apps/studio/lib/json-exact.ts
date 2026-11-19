// JSON that keeps every number exactly as written (SPEC-studio.md "v1.6"): the form builder rewrites
// data.schema.json, samples and report.json, and 12345678901234567.89 must not come back as a float.
// Numbers are parsed into JSON.rawJSON tokens (via the reviver's context.source) and JSON.stringify writes them
// back verbatim. Read a number only through num().

type RawJSON = { readonly rawJSON: string };
type JsonWithRaw = typeof JSON & {
  rawJSON?: (text: string) => RawJSON;
  isRawJSON?: (value: unknown) => value is RawJSON;
};
type Reviver = (key: string, value: unknown, context?: { source?: string }) => unknown;

const J = JSON as JsonWithRaw;

/** Whether this runtime can read and write numbers exactly; without it the builder is read-only. */
export function canEditExactly(): boolean {
  if (typeof J.rawJSON !== "function" || typeof J.isRawJSON !== "function") return false;
  try {
    const sources: unknown[] = [];
    JSON.parse("[0.10]", ((_k, v, c) => (sources.push(c?.source), v)) as Reviver);
    return sources[0] === "0.10" && JSON.stringify([J.rawJSON("0.10")]) === "[0.10]";
  } catch {
    return false;
  }
}

/** JSON.parse that turns every number into an exact token. Throws SyntaxError like JSON.parse. */
export function parseExact(text: string): unknown {
  const reviver: Reviver = (_key, value, context) =>
    typeof value === "number" && context?.source !== undefined ? J.rawJSON!(context.source) : value;
  return JSON.parse(text, reviver as (this: unknown, key: string, value: unknown) => unknown);
}

/** The text of a parsed document: 2-space JSON and a final newline (the starters' format). */
export function stringifyExact(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export const isExactNumber = (v: unknown): v is RawJSON => J.isRawJSON?.(v) === true;

/** A number token written from text that already passed a number regex. */
export const exactNumber = (text: string): RawJSON => J.rawJSON!(text);

/** The number in a value: a token or a plain number; anything else → undefined. */
export function num(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  return isExactNumber(v) ? Number(v.rawJSON) : undefined;
}

/** The text of a number as written in the file ("0.10" stays "0.10"). */
export function numText(v: unknown): string | undefined {
  if (typeof v === "number") return String(v);
  return isExactNumber(v) ? v.rawJSON : undefined;
}
