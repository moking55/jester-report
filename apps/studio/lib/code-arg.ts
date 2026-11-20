// The text of a QR code or barcode as the panel shows it: plain text, with {{ … }} where a value comes from the data.
// Underneath it is a Jinja argument: plain text is a string literal, {{ x }} an expression, mixed text joins them with ~.

/** Split a call's arguments at the top-level commas (not inside quotes, brackets or braces). */
export function splitArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let from = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(args.slice(from, i));
      from = i + 1;
    }
  }
  out.push(args.slice(from));
  return out;
}

/** The pieces of an expression joined by ~ at the top level. */
function joined(expr: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let from = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "~" && depth === 0) {
      out.push(expr.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(expr.slice(from).trim());
  return out;
}

/** The text a string literal holds, or null when `piece` is not one string literal. */
function literal(piece: string): string | null {
  const q = piece[0];
  if ((q !== '"' && q !== "'") || piece.length < 2 || piece[piece.length - 1] !== q) return null;
  const body = piece.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\") i++;
    else if (body[i] === q) return null; // two literals, not one
  }
  try {
    return JSON.parse(q === '"' ? piece : `"${body.replace(/\'/g, "'").replace(/"/g, '\\"')}"`) as string;
  } catch {
    return null;
  }
}

const unwrap = (piece: string): string => {
  if (!piece.startsWith("(") || !piece.endsWith(")")) return piece;
  let depth = 0;
  for (let i = 0; i < piece.length; i++) {
    if (piece[i] === "(") depth++;
    else if (piece[i] === ")" && --depth === 0 && i < piece.length - 1) return piece; // "(a) + (b)"
  }
  return piece.slice(1, -1).trim();
};

/** A Jinja argument as the text the panel shows. */
export function argToText(arg: string, numeric = false): string {
  const a = arg.trim();
  if (!a) return "";
  if (numeric && /^\d+(\.\d+)?$/.test(a)) return a;
  const pieces = joined(a);
  const texts = pieces.map((p) => {
    const lit = literal(p);
    if (lit !== null) return lit.replace(/\{\{/g, "{ {");
    return `{{ ${pieces.length > 1 ? unwrap(p) : p} }}`;
  });
  return texts.join("");
}

/** The text the panel shows as a Jinja argument. `numeric`: a text that is only a number stays a number (an amount). */
export function textToArg(text: string, numeric = false): string {
  const t = text.trim();
  if (numeric && /^\d+(\.\d+)?$/.test(t)) return t;
  const parts: string[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    if (m.index > last) parts.push(JSON.stringify(text.slice(last, m.index)));
    parts.push(m[1].trim() || '""');
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(JSON.stringify(text.slice(last)));
  if (!parts.length) return '""';
  if (parts.length === 1) return parts[0] || '""';
  return parts.map((p) => (p.startsWith('"') ? p : `(${p})`)).join(" ~ ");
}
