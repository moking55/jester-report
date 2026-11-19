import { describe, expect, it } from "vitest";

import type { Problem } from "@/lib/api-core";
import { saveSteps, type SaveOps } from "@/lib/builder-save";

const problem = (status: number): Problem => ({
  type: "about:blank",
  title: "x",
  status,
  code: status === 412 ? "REVISION_CONFLICT" : "INTERNAL_ERROR",
  detail: "",
  retryable: false,
});

/** Fake api: records calls; fails the named file with `status`. */
function fake(failName?: string, status = 500) {
  const calls: string[] = [];
  const ops: SaveOps = {
    put: async (name, _text, revision) => {
      calls.push(`put ${name} @${revision}`);
      return name === failName ? { ok: false, problem: problem(status) } : { ok: true, data: { revision: revision + 1 } };
    },
    remove: async (name, revision) => {
      calls.push(`delete ${name} @${revision}`);
      return { ok: true, data: { revision: revision + 1 } };
    },
  };
  return { calls, ops };
}

const steps = [
  { name: "data.schema.json", text: "{}" },
  { name: "sample.json", text: "{}" },
  { name: "report.json", text: "{}" },
  { name: "form.json", text: null },
];

describe("saving the builder", () => {
  it("writes in order, each at the revision the previous write returned; null deletes", async () => {
    const { calls, ops } = fake();
    const out = await saveSteps(steps, 7, ops);
    expect(calls).toEqual([
      "put data.schema.json @7",
      "put sample.json @8",
      "put report.json @9",
      "delete form.json @10",
    ]);
    expect(out).toEqual({ ok: true, revision: 11, saved: steps.map((s) => s.name) });
  });

  it("stops at a failure and says what was written and what is left", async () => {
    const { calls, ops } = fake("report.json");
    const out = await saveSteps(steps, 7, ops);
    expect(calls).toHaveLength(3);
    expect(out).toMatchObject({
      ok: false,
      revision: 9,
      saved: ["data.schema.json", "sample.json"],
      failedAt: "report.json",
      pending: ["report.json", "form.json"],
      conflict: false,
    });
  });

  it("calls a 412 a conflict and writes nothing after it", async () => {
    const { calls, ops } = fake("data.schema.json", 412);
    const out = await saveSteps(steps, 7, ops);
    expect(calls).toEqual(["put data.schema.json @7"]);
    expect(out).toMatchObject({ ok: false, conflict: true, saved: [], revision: 7 });
  });

  it("treats a thrown error (network) as a failure, not a crash", async () => {
    const ops: SaveOps = {
      put: async () => {
        throw new Error("offline");
      },
      remove: async () => ({ ok: true, data: { revision: 1 } }),
    };
    const out = await saveSteps(steps.slice(0, 1), 3, ops);
    expect(out).toMatchObject({ ok: false, failedAt: "data.schema.json", conflict: false, problem: null });
  });
});
