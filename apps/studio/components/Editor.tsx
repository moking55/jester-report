"use client";

import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, keymap, MatchDecorator, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

import { diagnosticsFor, offsetOf } from "@/lib/diagnostics";
import { suggest } from "@/lib/jinja-complete";
import type { ValidationProblem } from "@/lib/workspace";

import styles from "./Editor.module.css";

export type EditorHandle = {
  content: (name: string) => string | undefined;
  /** After a save: the file is clean again unless it was typed into meanwhile. */
  markSaved: (name: string, content: string) => boolean;
  /** Shows a line of a file; the caller also sets `active` to that file. */
  goto: (name: string, line: number, column?: number) => void;
};

type Props = {
  files: { name: string; content: string }[];
  active: string;
  generation: number; // a new value (reload) replaces every editor state
  problems: ValidationProblem[];
  onDirty: (name: string, dirty: boolean) => void;
  onSave: () => void;
  readOnly?: boolean; // an archived template: read, select and copy, but no edits
  ref?: Ref<EditorHandle>;
};

// {{ … }}, {% … %} and {# … #} stand out from the HTML around them.
const jinja = new MatchDecorator({
  regexp: /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g,
  decoration: Decoration.mark({ class: "cm-jinja" }),
});
const jinjaHighlight = ViewPlugin.define((view) => ({ decorations: jinja.createDeco(view), update(u: ViewUpdate) {
  this.decorations = jinja.updateDeco(u, this.decorations);
} }), { decorations: (v) => v.decorations });

export const language = (name: string): Extension =>
  name.endsWith(".json") ? json() : name.endsWith(".css") ? css() : [html(), jinjaHighlight];

export function Editor({ files, active, generation, problems, onDirty, onSave, readOnly = false, ref }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>()); // one per file, so switching keeps edits and undo
  const dirty = useRef(new Set<string>());
  const shown = useRef(active); // the file whose state the view holds right now
  const callbacks = useRef({ onDirty, onSave });
  useEffect(() => {
    callbacks.current = { onDirty, onSave }; // CodeMirror's listeners are made once; they read the latest
  });

  // {{ … }} / {% … %} completion: the binder's context, fmt helpers, names from the draft's report.json
  const jinja = (context: CompletionContext): CompletionResult | null => {
    const reportJson =
      states.current.get("report.json")?.doc.toString() ?? files.find((f) => f.name === "report.json")?.content;
    const found = suggest(context.state.sliceDoc(0, context.pos), reportJson);
    if (!found || (found.back === 0 && !context.explicit && !/[.{%\s]$/.test(context.state.sliceDoc(0, context.pos))))
      return null;
    return { from: context.pos - found.back, options: found.options, validFor: /^\w*$/ };
  };

  const stateFor = (name: string, content: string) =>
    EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        lintGutter(),
        language(name),
        name.endsWith(".html") ? EditorState.languageData.of(() => [{ autocomplete: jinja }]) : [],
        EditorState.readOnly.of(readOnly),
        keymap.of([{ key: "Mod-s", preventDefault: true, run: () => (callbacks.current.onSave(), true) }]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !dirty.current.has(name)) {
            dirty.current.add(name);
            callbacks.current.onDirty(name, true);
          }
        }),
      ],
    });

  // First load and reload after a conflict: every editor state starts again from `files`.
  useEffect(() => {
    states.current = new Map(files.map((f) => [f.name, stateFor(f.name, f.content)]));
    dirty.current.clear();
    view.current?.setState(states.current.get(active) ?? stateFor(active, ""));
    shown.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a reload resets the editors
  }, [generation]);

  // A file added or deleted: only that state changes, edits in the other files stay.
  useEffect(() => {
    const names = new Set(files.map((f) => f.name));
    for (const f of files) if (!states.current.has(f.name)) states.current.set(f.name, stateFor(f.name, f.content));
    for (const name of [...states.current.keys()]) {
      if (names.has(name)) continue;
      states.current.delete(name);
      dirty.current.delete(name);
      if (shown.current === name) shown.current = ""; // let show() swap in the next file
    }
    show(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the file list only
  }, [files]);

  useEffect(() => {
    if (!host.current) return;
    view.current = new EditorView({ parent: host.current, state: states.current.get(active) });
    return () => view.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; switching files swaps the state
  }, []);

  function show(name: string) {
    const v = view.current;
    const next = states.current.get(name);
    if (!v || !next || shown.current === name) return;
    if (states.current.has(shown.current)) states.current.set(shown.current, v.state); // keep the edits being left
    v.setState(next);
    shown.current = name;
  }

  useEffect(() => show(active), [active]);

  // Problems follow the file on screen; switching files swaps the state, so set them again.
  useEffect(() => {
    const v = view.current;
    if (v) v.dispatch(setDiagnostics(v.state, diagnosticsFor(v.state.doc, shown.current, problems)));
  }, [active, problems]);

  // The file on screen lives in the view; the others in `states`.
  const textOf = (name: string) =>
    (name === shown.current ? view.current?.state : states.current.get(name))?.doc.toString();

  useImperativeHandle(ref, () => ({
    content: textOf,
    markSaved: (name, content) => {
      const now = textOf(name);
      const clean = now === content;
      if (clean) dirty.current.delete(name);
      return !clean;
    },
    goto: (name, line, column) => {
      show(name);
      const v = view.current;
      if (!v || shown.current !== name) return;
      const at = offsetOf(v.state.doc, line, column);
      v.dispatch({ selection: EditorSelection.cursor(at), effects: EditorView.scrollIntoView(at, { y: "center" }) });
      v.focus();
    },
  }));

  return <div ref={host} className={styles.editor} />;
}
