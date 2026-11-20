"use client";

import { useSyncExternalStore } from "react";

import type { Format, FormatState } from "./doc-format";

// The text editor on the paper (the one being typed in) and the toolbar are far apart in the tree: the editor
// registers what it can do here, and the toolbar's buttons use it. Only one text is edited at a time.

export type EditorHandle = {
  toggle: (f: Format, color?: string | null) => void;
  clear: () => void;
  /** What is at the caret or selection, and whether text is selected (a caret alone formats nothing). */
  state: () => { selected: boolean; format: FormatState } | null;
};

let active: EditorHandle | null = null;
let version = 0;
const listeners = new Set<() => void>();

export const editorBus = {
  set(handle: EditorHandle | null) {
    active = handle;
    this.notify();
  },
  /** The selection moved or the text changed: the toolbar looks again. */
  notify() {
    version++;
    listeners.forEach((l) => l());
  },
};

/** The editor being typed in, or null; the component renders again when it or its selection changes. */
export function useEditor(): EditorHandle | null {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => version,
    () => 0,
  );
  return active;
}
