"use client";

import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef, useState } from "react";

import { checkCode, type CheckProblem } from "@/lib/doc-check";
import { suggest } from "@/lib/jinja-complete";

import { language } from "../Editor";
import styles from "./Designer.module.css";

// The Custom Code modal (SPEC-studio.md "v1.7" Custom Code กันพลาด): CodeMirror with the editor's Jinja
// completion and a few snippets; "ตกลง" checks the code with lib/doc-check first and will not close on a problem.

export const SNIPPETS: Completion[] = [
  snippetCompletion("{% if ${เงื่อนไข} %}\n  ${}\n{% endif %}", { label: "if", detail: "เงื่อนไข", type: "keyword", boost: 50 }),
  snippetCompletion("{% if ${เงื่อนไข} %}\n  ${}\n{% else %}\n  \n{% endif %}", { label: "if-else", detail: "เงื่อนไข + ไม่เช่นนั้น", type: "keyword", boost: 50 }),
  snippetCompletion("{% for ${item} in ${lists.items} %}\n  ${}\n{% endfor %}", { label: "for", detail: "วนซ้ำ", type: "keyword", boost: 50 }),
  snippetCompletion("{% set ${ชื่อ} = ${ค่า} %}", { label: "set", detail: "ตั้งค่าตัวแปร", type: "keyword", boost: 50 }),
  snippetCompletion("{{ ${} }}", { label: "{{", detail: "แสดงค่า", type: "keyword", boost: 50 }),
];

type Props = {
  code: string;
  reportJson: string | undefined;
  readOnly: boolean;
  onSave: (code: string) => void;
  onClose: () => void;
};

/** Problems as CodeMirror diagnostics, each over its whole line. */
const diagnostics = (state: EditorState, problems: CheckProblem[]) =>
  problems.map((p) => {
    const line = state.doc.line(Math.min(p.line, state.doc.lines));
    return { from: line.from, to: line.to, severity: "error" as const, message: p.message };
  });

export function CustomCodeModal({ code, reportJson, readOnly, onSave, onClose }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [problems, setProblems] = useState<CheckProblem[]>([]);

  useEffect(() => {
    const complete = (context: CompletionContext): CompletionResult | null => {
      const before = context.state.sliceDoc(0, context.pos);
      const found = suggest(before, reportJson);
      if (found && (found.back > 0 || context.explicit || /[.{%\s]$/.test(before)))
        return { from: context.pos - found.back, options: found.options, validFor: /^\w*$/ };
      const word = context.matchBefore(/[\w{-]+$/);
      if (!word && !context.explicit) return null;
      return { from: word?.from ?? context.pos, options: SNIPPETS };
    };
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: code,
        extensions: [
          basicSetup,
          lintGutter(),
          language("template.html"),
          EditorState.languageData.of(() => [{ autocomplete: complete }]),
          EditorState.readOnly.of(readOnly),
        ],
      }),
    });
    view.current.focus();
    return () => view.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- made once per modal
  }, []);

  function save() {
    const v = view.current!;
    const text = v.state.doc.toString();
    const found = checkCode(text);
    setProblems(found);
    v.dispatch(setDiagnostics(v.state, diagnostics(v.state, found)));
    if (found.length) return;
    if (text === code) return onClose();
    onSave(text);
  }

  return (
    <div className={styles.backdrop} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className={styles.codeModal} role="dialog" aria-label="Custom Code">
        <div className={styles.modalBar}>
          <b>Custom Code</b>
          <span className={styles.hint}>HTML + Jinja · Ctrl+Space ช่วยพิมพ์ (if, for, set, ช่องข้อมูล)</span>
          <span className={styles.spacer} />
          <button type="button" onClick={onClose}>
            ยกเลิก
          </button>
          {!readOnly && (
            <button type="button" className={styles.primary} onClick={save}>
              ตกลง
            </button>
          )}
        </div>
        {problems.length > 0 && (
          <div role="alert" className={styles.alert}>
            ยังปิดไม่ได้:{" "}
            {problems.map((p, i) => (
              <span key={i}>
                บรรทัด {p.line}: {p.message}
                {i < problems.length - 1 ? " · " : ""}
              </span>
            ))}
          </div>
        )}
        <div ref={host} className={styles.codeHost} />
      </div>
    </div>
  );
}
