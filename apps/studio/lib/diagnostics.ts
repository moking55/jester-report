import type { Diagnostic } from "@codemirror/lint";
import type { Text } from "@codemirror/state";

import type { ValidationProblem } from "./workspace";

/** Offset of a 1-based line/column, clamped: problems can be older than the text they point into. */
export function offsetOf(doc: Text, line: number, column = 1): number {
  const l = doc.line(Math.min(Math.max(line, 1), doc.lines));
  return l.from + Math.min(Math.max(column - 1, 0), l.length);
}

/** The problems of one file that have a line, as CodeMirror diagnostics (gutter marker + underline). */
export function diagnosticsFor(doc: Text, file: string, problems: ValidationProblem[]): Diagnostic[] {
  return problems
    .filter((p) => p.file === file && p.line !== undefined)
    .map((p) => {
      const from = offsetOf(doc, p.line!, p.column);
      const to = p.column === undefined ? doc.lineAt(from).to : Math.min(from + 1, doc.lineAt(from).to);
      return { from, to: Math.max(to, from), severity: p.severity, message: `${p.code}: ${p.message}` };
    });
}
