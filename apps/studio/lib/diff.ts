// What differs between two snapshots of a template (draft or version), for the diff dialog.

export type Snapshot = {
  files: { name: string; content: string }[];
  assets: { name: string; sha256: string }[];
};

export type Change = { name: string; kind: "file" | "asset"; status: "added" | "removed" | "changed" };

export const EMPTY: Snapshot = { files: [], assets: [] };

function changes<T extends { name: string }>(kind: Change["kind"], from: T[], to: T[], same: (a: T, b: T) => boolean) {
  const before = new Map(from.map((x) => [x.name, x]));
  const after = new Map(to.map((x) => [x.name, x]));
  const out: Change[] = [];
  for (const name of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const a = before.get(name);
    const b = after.get(name);
    if (!a) out.push({ name, kind, status: "added" });
    else if (!b) out.push({ name, kind, status: "removed" });
    else if (!same(a, b)) out.push({ name, kind, status: "changed" });
  }
  return out;
}

/** Files and assets that differ going from `from` to `to`; files first, each sorted by name. Assets compare by hash. */
export function compare(from: Snapshot, to: Snapshot): Change[] {
  return [
    ...changes("file", from.files, to.files, (a, b) => a.content === b.content),
    ...changes("asset", from.assets, to.assets, (a, b) => a.sha256 === b.sha256),
  ];
}
