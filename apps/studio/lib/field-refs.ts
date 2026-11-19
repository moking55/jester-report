// The "ช่องข้อมูล" tab and the builder's rename/remove warning (SPEC-studio.md "v1.6"): what to type in a template
// for each field, and which fields the templates do not seem to use. Text search, not a Jinja parser: access
// like data[k] is not seen, so "not used" is a hint, never a rule.

import { fieldTree, openBuilder, type BuilderField, type FieldPath, type Kind, type Result } from "./schema-edit";

export type FieldRef = {
  pointer: string;
  key: string;
  label: string;
  kind: Kind | null;
  expression: string; // what to paste: {{ … }} for a value, {% for … %}…{% endfor %} for a table
  unused: boolean; // a value field no template or report.json expression mentions
  children: FieldRef[];
};

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const wrap = (kind: Kind | null, path: string) =>
  kind === "money" ? `{{ fmt.money(${path}) }}` : kind === "date" ? `{{ fmt.thai_date(${path}) }}` : `{{ ${path} }}`;

/** Every string inside report.json's lists and totals: the expressions and column names that use fields. */
function reportStrings(report: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (isObject(v)) Object.values(v).forEach(walk);
  };
  if (isObject(report)) {
    walk(report.lists);
    walk(report.totals);
  }
  return out;
}

const htmlFiles = (files: Record<string, string>) => Object.entries(files).filter(([name]) => name.endsWith(".html"));

function usedIn(files: Record<string, string>, strings: string[], key: string): string[] {
  const inHtml = new RegExp(`\\.${escape(key)}\\b|\\[\\s*["']${escape(key)}["']\\s*\\]`);
  const inExpr = new RegExp(`(^|[^A-Za-z0-9_])${escape(key)}($|[^A-Za-z0-9_])`);
  const out = htmlFiles(files)
    .filter(([, text]) => inHtml.test(text))
    .map(([name]) => name);
  if (strings.some((s) => inExpr.test(s))) out.push("report.json");
  return out;
}

/** The lists in report.json by the data keys of their array: "items" → top list "items"; child lists too. */
function listNames(report: unknown): Map<string, { name: string; depth: number }> {
  const out = new Map<string, { name: string; depth: number }>();
  const walk = (lists: unknown, base: string[], depth: number) => {
    if (!isObject(lists)) return;
    for (const [name, spec] of Object.entries(lists)) {
      if (!isObject(spec) || typeof spec.path !== "string") continue;
      const full = [...base, ...spec.path.split("/").slice(1)];
      out.set(full.join("/"), { name, depth });
      walk(spec.lists, full, depth + 1);
    }
  };
  if (isObject(report)) walk(report.lists, [], 0);
  return out;
}

/** The field refs of a draft (or the editor's unsaved files). */
export function fieldRefs(files: Record<string, string>): Result<{ params: FieldRef[]; data: FieldRef[] }> {
  const opened = openBuilder(files);
  if (!opened.ok) return opened;
  let report: unknown;
  try {
    report = JSON.parse(files["report.json"]);
  } catch {
    report = {};
  }
  const strings = reportStrings(report);
  const lists = listNames(report);
  const tree = fieldTree(opened.value);

  const ref = (f: BuilderField, path: string, children: FieldRef[] = []): FieldRef => ({
    pointer: f.pointer,
    key: f.key,
    label: f.props.label ?? f.key,
    kind: f.kind,
    expression: wrap(f.kind, path),
    unused: f.kind !== "group" && f.kind !== "table" && usedIn(files, strings, f.key).length === 0,
    children,
  });

  // `scope` is how the template reaches this level: "data.customer", or the loop variable inside a table
  const walk = (fields: BuilderField[], scope: string, inLoop: boolean): FieldRef[] =>
    fields.map((f) => {
      if (f.kind === "group") {
        const r = ref(f, `${scope}.${f.key}`, walk(f.children, `${scope}.${f.key}`, inLoop));
        return { ...r, expression: `{{ ${scope}.${f.key} }}` };
      }
      const list = lists.get(f.path.keys.join("/"));
      if (f.kind === "table" || (f.kind === null && list)) {
        // a read-only nested table still has a loop to copy; its columns are not listed
        const v = inLoop ? "row" : "item";
        const source = list && list.depth === 0 ? `lists.${list.name}` : `${scope}.${f.key}`;
        return {
          ...ref(f, source, walk(f.children, v, true)),
          expression: `{% for ${v} in ${source} %}…{% endfor %}`,
        };
      }
      return ref(f, `${scope}.${f.key}`);
    });

  return {
    ok: true,
    value: {
      params: tree.params.map((f) => ref(f, `params.${f.key}`)),
      data: walk(tree.data, "data", false),
    },
  };
}

/** Files that may still use the field at `path` (warn before a rename or remove). */
export function references(files: Record<string, string>, path: FieldPath): string[] {
  let report: unknown;
  try {
    report = JSON.parse(files["report.json"]);
  } catch {
    report = {};
  }
  return usedIn(files, reportStrings(report), path.keys[path.keys.length - 1]);
}
