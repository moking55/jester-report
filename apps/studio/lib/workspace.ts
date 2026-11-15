// Workspace state changes as plain immer recipes, so Vitest can test them without CodeMirror.
// The editor owns the text being typed; this state holds what the api last confirmed.
import type { Problem } from "./api-core";
import type { components } from "./types.gen";

export type Draft = components["schemas"]["Draft"];
export type TextFile = components["schemas"]["TextFile"];
export type ValidationProblem = components["schemas"]["ValidationProblem"];
export type ValidationResult = components["schemas"]["ValidationResult"];
export type PreparedData = components["schemas"]["PreparedData"];
export type Run = components["schemas"]["Run"];
export type Asset = components["schemas"]["Asset"];
export type Version = components["schemas"]["Version"];

export type Result<T> = { ok: true; data: T } | { ok: false; problem: Problem };

export type WorkspaceState = {
  templateId: string;
  revision: number;
  files: TextFile[]; // contents as loaded; the editor holds what is typed
  assets: Asset[];
  generation: number; // bumped by a reload: the editor drops every state and starts from `files`
  active: string;
  dirty: string[]; // files with edits the api has not seen
  saving: boolean;
  conflict: boolean; // 412: someone else saved first; nothing is overwritten
  error: string | null;
  problems: ValidationProblem[];
  checked: "never" | "valid" | "invalid"; // the last Validate, for the Problems tab
  tab: "problems" | "prepared" | "provenance" | "versions";
  paramsText: string; // the params box shared by Preview and Prepared data
  prepared: PreparedData | null;
  run: Run | null;
  lastPublished: number | null; // keys the Versions panel, so a publish reloads its list
};

export function initialState(draft: Draft, paramsText = "{}"): WorkspaceState {
  const names = draft.files.map((f) => f.name);
  return {
    templateId: draft.templateId,
    revision: draft.revision,
    files: draft.files,
    assets: draft.assets,
    generation: 0,
    active: names.includes("template.html") ? "template.html" : (names[0] ?? ""),
    dirty: [],
    saving: false,
    conflict: false,
    error: null,
    problems: [],
    checked: "never",
    tab: "problems",
    paramsText,
    prepared: null,
    run: null,
    lastPublished: null,
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
  if (problem.problems?.length) {
    s.problems = problem.problems;
    s.tab = "problems";
  }
};

export const reloaded = (draft: Draft) => (s: WorkspaceState) => {
  const next = initialState(draft, s.paramsText);
  next.active = draft.files.some((f) => f.name === s.active) ? s.active : next.active;
  return { ...next, tab: s.tab, run: s.run, generation: s.generation + 1 };
};

export const fileAdded = (name: string, revision: number) => (s: WorkspaceState) => {
  s.revision = revision;
  s.error = null;
  if (!s.files.some((f) => f.name === name)) s.files.push({ name, content: "", sha256: "" });
  s.active = name;
};

export const fileRemoved = (name: string, revision: number) => (s: WorkspaceState) => {
  s.revision = revision;
  s.error = null;
  s.files = s.files.filter((f) => f.name !== name);
  s.dirty = s.dirty.filter((n) => n !== name);
  if (s.active === name) s.active = "template.html";
};

export const assetAdded = (asset: Asset, revision: number) => (s: WorkspaceState) => {
  s.revision = revision;
  s.error = null;
  s.assets = [...s.assets.filter((a) => a.name !== asset.name), asset];
};

export const assetRemoved = (name: string, revision: number) => (s: WorkspaceState) => {
  s.revision = revision;
  s.error = null;
  s.assets = s.assets.filter((a) => a.name !== name);
};
