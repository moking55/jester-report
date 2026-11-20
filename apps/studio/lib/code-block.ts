// A QR / PromptPay / barcode block's expression as the panel and toolbar see it (SPEC-studio.md v1.9): the kind, the
// text (a first argument shown as text with {{ }} for values), the PromptPay amount, and the rest of the arguments
// (size_mm=…) kept as written.

import { argToText, splitArgs, textToArg } from "./code-arg";

export type CodeType = "qr" | "promptpay" | "barcode";
export type CodeBlock = { type: CodeType; text: string; amount: string; more: string };

export const CODE_NAME: Record<CodeType, string> = { qr: "QR code", promptpay: "QR PromptPay", barcode: "บาร์โค้ด" };

/** `fmt.qr(…)`, `fmt.qr(fmt.promptpay(…), size_mm=…)` or `fmt.barcode(…)`; null for any other expression. */
export function readCode(inner: string): CodeBlock | null {
  const m = /^fmt\.(qr|barcode)\(([\s\S]*)\)$/.exec(inner.trim());
  if (!m) return null;
  const [first = "", ...rest] = splitArgs(m[2]);
  const more = rest.map((r) => `,${r}`).join("");
  const call = m[1] === "qr" ? /^\s*fmt\.promptpay\(([\s\S]*)\)\s*$/.exec(first) : null;
  if (call) {
    const [target = "", amount = ""] = splitArgs(call[1]);
    return { type: "promptpay", text: argToText(target), amount: argToText(amount.trim(), true), more };
  }
  return { type: m[1] as "qr" | "barcode", text: argToText(first), amount: "", more };
}

/** The expression (without {{ }}) for a code block. */
export function writeCode(c: CodeBlock): string {
  const a = textToArg(c.text);
  if (c.type === "promptpay") {
    const money = c.amount.trim() ? `, ${textToArg(c.amount, true)}` : "";
    return `fmt.qr(fmt.promptpay(${a}${money})${c.more})`;
  }
  return `fmt.${c.type}(${a}${c.more})`;
}
