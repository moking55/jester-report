// Decimal arithmetic for the Document Designer's sample (SPEC-studio.md v1.9): + - * / ( ) and `| round(n)` over decimal
// strings, exact and printed the way Python's Decimal prints them, so a variable's value on the paper is the PDF's.
// Templates get Decimal from data-prep, and Jinja's float literals (0.07) do not mix with Decimal: only integer literals here.

export type Dec = { c: bigint; e: number }; // value = c × 10^e, e ≤ 0

const PRECISION = 28; // Python's default Decimal context

export function parseDec(text: string): Dec | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) return null;
  const frac = m[3] ?? "";
  return { c: BigInt(`${m[1]}${m[2]}${frac}`), e: -frac.length };
}

export function decText(d: Dec): string {
  const neg = d.c < 0n;
  const digits = (neg ? -d.c : d.c).toString().padStart(-d.e + 1, "0");
  const at = digits.length + d.e;
  return `${neg ? "-" : ""}${d.e < 0 ? `${digits.slice(0, at)}.${digits.slice(at)}` : digits}`;
}

const pow10 = (n: number) => 10n ** BigInt(n);
const align = (a: Dec, b: Dec): [bigint, bigint, number] => {
  const e = Math.min(a.e, b.e);
  return [a.c * pow10(a.e - e), b.c * pow10(b.e - e), e];
};

const add = (a: Dec, b: Dec): Dec => {
  const [x, y, e] = align(a, b);
  return { c: x + y, e };
};
const sub = (a: Dec, b: Dec): Dec => {
  const [x, y, e] = align(a, b);
  return { c: x - y, e };
};
const mul = (a: Dec, b: Dec): Dec => ({ c: a.c * b.c, e: a.e + b.e });

const digitsOf = (c: bigint) => (c < 0n ? -c : c).toString().length;

/** Half-even division of n by d. */
function halfEven(n: bigint, d: bigint): bigint {
  const sign = n < 0n !== d < 0n ? -1n : 1n;
  const [x, y] = [n < 0n ? -n : n, d < 0n ? -d : d];
  let q = x / y;
  const r2 = (x % y) * 2n;
  if (r2 > y || (r2 === y && q % 2n === 1n)) q += 1n;
  return sign * q;
}

/** Python's Decimal division: exact when it can be (down to the ideal exponent), else 28 significant digits. */
function div(a: Dec, b: Dec): Dec | null {
  if (b.c === 0n) return null;
  const ideal = a.e - b.e;
  for (let extra = 0; extra <= PRECISION + digitsOf(a.c) + 2; extra++) {
    // coefficient at exponent ideal - extra: a.c × 10^extra / b.c
    const num = a.c * pow10(extra);
    if (num % b.c === 0n) {
      const c = num / b.c;
      if (digitsOf(c) <= PRECISION) return { c, e: ideal - extra };
      break;
    }
  }
  // inexact: PRECISION significant digits
  let extra = PRECISION + digitsOf(b.c) - digitsOf(a.c) + 1;
  if (extra < 0) extra = 0;
  let c = halfEven(a.c * pow10(extra), b.c);
  let e = ideal - extra;
  while (digitsOf(c) > PRECISION) {
    c = halfEven(c, 10n);
    e += 1;
  }
  return { c, e };
}

/** `value | round(places)`: half-even like Python's round(Decimal, n); the exponent becomes -places. */
function round(a: Dec, places: number): Dec {
  if (a.e === -places) return a;
  if (a.e > -places) return { c: a.c * pow10(a.e + places), e: -places };
  return { c: halfEven(a.c, pow10(-places - a.e)), e: -places };
}

type Tok = { t: "num" | "path" | "op"; v: string };

function tokens(src: string): Tok[] | null {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[\d+\])*)|([-+*/()|,]))/y;
  let at = 0;
  while (at < src.length) {
    re.lastIndex = at;
    const m = re.exec(src);
    if (!m) return src.slice(at).trim() === "" ? out : null;
    out.push(m[1] !== undefined ? { t: "num", v: m[1] } : m[2] !== undefined ? { t: "path", v: m[2] } : { t: "op", v: m[3] });
    at = re.lastIndex;
  }
  return out;
}

/**
 * An arithmetic expression over decimals: `value(path)` gives a path's decimal (null when it is not one).
 * null when it is not arithmetic this can do (a float literal, an unknown filter, a path that is no number).
 */
export function calc(src: string, value: (path: string) => Dec | null): Dec | null {
  const toks = tokens(src);
  if (!toks || !toks.length) return null;
  let i = 0;
  let failed = false;
  const peek = () => toks[i];
  const take = () => toks[i++];
  const fail = (): Dec => {
    failed = true;
    return { c: 0n, e: 0 };
  };

  function primary(): Dec {
    const t = take();
    let v: Dec;
    if (!t) return fail();
    if (t.t === "num") {
      const d = /^\d+$/.test(t.v) ? parseDec(t.v) : null; // a decimal point is a float in Jinja
      v = d ?? fail();
    } else if (t.t === "path") {
      v = value(t.v) ?? fail();
    } else if (t.v === "(") {
      v = expr();
      if (take()?.v !== ")") return fail();
    } else return fail();
    while (peek()?.v === "|") {
      take();
      const name = take();
      if (name?.v !== "round") return fail();
      let places = 0;
      if (peek()?.v === "(") {
        take();
        const n = take();
        if (n?.t !== "num" || !/^\d+$/.test(n.v) || take()?.v !== ")") return fail();
        places = Number(n.v);
      }
      v = round(v, places);
    }
    return v;
  }
  function unary(): Dec {
    if (peek()?.v === "-") {
      take();
      const v = unary();
      return { c: -v.c, e: v.e };
    }
    return primary();
  }
  function term(): Dec {
    let v = unary();
    while (peek()?.v === "*" || peek()?.v === "/") {
      const op = take().v;
      const r = unary();
      if (failed) return v;
      const out = op === "*" ? mul(v, r) : div(v, r);
      v = out ?? fail();
    }
    return v;
  }
  function expr(): Dec {
    let v = term();
    while (peek()?.v === "+" || peek()?.v === "-") {
      const op = take().v;
      const r = term();
      v = op === "+" ? add(v, r) : sub(v, r);
    }
    return v;
  }

  const result = expr();
  return failed || i < toks.length || result.e > 0 ? null : result;
}
