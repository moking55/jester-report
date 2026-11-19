// Saving the form builder (SPEC-studio.md "v1.6"): the changed files one by one with putDraftFile, each at the
// revision the previous write returned. No atomic endpoint (user's choice): a save that stops part way says what
// was written; saving again writes only what still differs. A 412 means someone else changed the draft: stop.

import type { Problem } from "./api-core";
import type { Result } from "./workspace";

export type SaveStep = { name: string; text: string | null }; // null: the file should not exist (form.json)

export type SaveOps = {
  put: (name: string, text: string, revision: number) => Promise<Result<{ revision: number }>>;
  remove: (name: string, revision: number) => Promise<Result<{ revision: number }>>;
};

export type SaveOutcome =
  | { ok: true; revision: number; saved: string[] }
  | {
      ok: false;
      revision: number; // the last revision a write returned (the draft's revision now)
      saved: string[];
      failedAt: string;
      pending: string[]; // the failed file and every file after it
      problem: Problem | null;
      conflict: boolean; // 412: someone else changed the draft first
    };

export async function saveSteps(steps: SaveStep[], revision: number, ops: SaveOps): Promise<SaveOutcome> {
  const saved: string[] = [];
  let rev = revision;
  for (const [i, step] of steps.entries()) {
    let result: Result<{ revision: number }>;
    try {
      result = step.text === null ? await ops.remove(step.name, rev) : await ops.put(step.name, step.text, rev);
    } catch {
      result = { ok: false, problem: null as unknown as Problem };
    }
    if (!result.ok) {
      return {
        ok: false,
        revision: rev,
        saved,
        failedAt: step.name,
        pending: steps.slice(i).map((s) => s.name),
        problem: result.problem ?? null,
        conflict: result.problem?.status === 412,
      };
    }
    rev = result.data.revision;
    saved.push(step.name);
  }
  return { ok: true, revision: rev, saved };
}
