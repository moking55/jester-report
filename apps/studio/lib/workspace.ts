// Workspace state changes as plain immer recipes, so Vitest can test them without CodeMirror.
// The editor owns the text being typed; this state holds what the api last confirmed.
import type { Problem } from "./api-core";
import type { components } from "./types.gen";

export type Draft = components["schemas"]["Draft"];
export type TextFile = components["schemas"]["TextFile"];
export type ValidationProblem = components["schemas"]["ValidationProblem"];
export type ValidationResult = components["schemas"]["ValidationResult"];

export type Result<T> = { ok: true; data: T } | { ok: false; problem: Problem };

export type WorkspaceState = {
  templateId: string;
  revision: number;
  files: TextFile[]; // as loaded; a new array (reload) resets the editor, so saves leave it alone
  active: string;
  dirty: string[]; // files with edits the api has not seen
  saving: boolean;
  conflict: boolean; // 412: someone else saved first; nothing is overwritten
  error: string | null;
  problems: ValidationProblem[];
  checked: "never" | "valid" | "invalid"; // the last Validate, for the Problems tab
};

export function initialState(draft: Draft): WorkspaceState {
  const names = draft.files.map((f) => f.name);
  return {
    templateId: draft.templateId,
    revision: draft.revision,
    files: draft.files,
    active: names.includes("template.html") ? "template.html" : (names[0] ?? ""),
    dirty: [],
    saving: false,
    conflict: false,
    error: null,
    problems: [],
    checked: "never",
  };
}

export const validated = (result: ValidationResult) => (s: WorkspaceState) => {
  s.problems = result.problems;
  s.checked = result.valid ? "valid" : "invalid";
  s.error = null;
};

export const setDirty = (name: string, dirty: boolean) => (s: WorkspaceState) => {
  s.dirty = s.dirty.filter((n) => n !== name);
  if (dirty) s.dirty.push(name);
};

export const saved = (name: string, revision: number, stillDirty: boolean) => (s: WorkspaceState) => {
  s.revision = revision;
  s.error = null;
  setDirty(name, stillDirty)(s);
};

export const failed = (problem: Problem, message: string) => (s: WorkspaceState) => {
  s.saving = false;
  if (problem.code === "REVISION_CONFLICT") {
    s.conflict = true;
    s.error = null;
    return;
  }
  s.error = message;
  if (problem.problems?.length) s.problems = problem.problems;
};

export const reloaded = (draft: Draft) => (s: WorkspaceState) => {
  const next = initialState(draft);
  next.active = draft.files.some((f) => f.name === s.active) ? s.active : next.active;
  return next;
};
