"use client";

import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, keymap, MatchDecorator, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

import styles from "./Editor.module.css";

export type EditorHandle = {
  content: (name: string) => string | undefined;
  /** After a save: the file is clean again unless it was typed into meanwhile. */
  markSaved: (name: string, content: string) => boolean;
};

type Props = {
  files: { name: string; content: string }[];
  active: string;
  onDirty: (name: string, dirty: boolean) => void;
  onSave: () => void;
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

const language = (name: string): Extension =>
  name.endsWith(".json") ? json() : name.endsWith(".css") ? css() : [html(), jinjaHighlight];

export function Editor({ files, active, onDirty, onSave, ref }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>()); // one per file, so switching keeps edits and undo
  const dirty = useRef(new Set<string>());
  const shown = useRef(active); // the file whose state the view holds right now
  const callbacks = useRef({ onDirty, onSave });
  useEffect(() => {
    callbacks.current = { onDirty, onSave }; // CodeMirror's listeners are made once; they read the latest
  });

  const stateFor = (name: string, content: string) =>
    EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        language(name),
        keymap.of([{ key: "Mod-s", preventDefault: true, run: () => (callbacks.current.onSave(), true) }]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !dirty.current.has(name)) {
            dirty.current.add(name);
            callbacks.current.onDirty(name, true);
          }
        }),
      ],
    });

  // A new `files` list (first load, reload after a conflict) replaces every editor state.
  useEffect(() => {
    states.current = new Map(files.map((f) => [f.name, stateFor(f.name, f.content)]));
    dirty.current.clear();
    view.current?.setState(states.current.get(active) ?? stateFor(active, ""));
    shown.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new file list resets the editors
  }, [files]);

  useEffect(() => {
    if (!host.current) return;
    view.current = new EditorView({ parent: host.current, state: states.current.get(active) });
    return () => view.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; switching files swaps the state
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v || shown.current === active) return;
    states.current.set(shown.current, v.state); // keep the edits of the file being left
    const next = states.current.get(active);
    if (next) v.setState(next);
    shown.current = active;
  }, [active]);

  useImperativeHandle(ref, () => ({
    content: (name) => (name === active ? view.current?.state : states.current.get(name))?.doc.toString(),
    markSaved: (name, content) => {
      const now = (name === active ? view.current?.state : states.current.get(name))?.doc.toString();
      const clean = now === content;
      if (clean) dirty.current.delete(name);
      return !clean;
    },
  }));

  return <div ref={host} className={styles.editor} />;
}
