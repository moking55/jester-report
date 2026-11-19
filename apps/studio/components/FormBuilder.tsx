"use client";

import { useMemo, useRef, useState } from "react";

import { references } from "@/lib/field-refs";
import { FORM_FILE } from "@/lib/form-layout";
import { canEditExactly } from "@/lib/json-exact";
import {
  addField,
  canMove,
  changedFiles,
  DATA_KINDS,
  fieldTree,
  findField,
  moveField,
  openBuilder,
  PARAM_KINDS,
  removeField,
  renameField,
  serialize,
  setProps,
  type Builder,
  type BuilderField,
  type FieldPath,
  type FieldProps,
  type Kind,
  type Section,
  type Target,
} from "@/lib/schema-edit";
import type { IssueSource } from "@/lib/workspace";

import { BuilderCanvas, BuilderDnd, PaletteItem } from "./BuilderCanvas";
import styles from "./FormBuilder.module.css";
import { IssueForm } from "./IssueForm";
import { PropsPanel, type Place } from "./PropsPanel";

type Props = {
  /** The draft's text files as the editor holds them when the builder opens. */
  files: Record<string, string>;
  readOnly: boolean;
  /** After every edit: the builder's files that differ from when it opened (form.json null: no layout to keep). */
  onChange: (files: Record<string, string | null>) => void;
};

/**
 * The form builder (SPEC-studio v1.6), shown in place of the editor for the data schema. Every edit goes into
 * the editor's files (unsaved); the workspace's own save writes them. "แก้ไข JSON" shows the same files as text.
 */
export function FormBuilder({ files, readOnly: archived, onChange }: Props) {
  const opened = useMemo(() => openBuilder(files), [files]);
  const exact = useMemo(() => canEditExactly(), []);
  const readOnly = archived || !exact || !opened.ok;

  const [builder, setBuilder] = useState<Builder | null>(opened.ok ? opened.value : null);
  const [selected, setSelected] = useState<FieldPath | null>(null);
  const [section, setSection] = useState<Section>("data"); // where the palette's Enter adds
  const [message, setMessage] = useState<string | null>(null);
  const touched = useRef(new Set<string>()); // files handed to the editor once keep being handed (an undo-to-start too)
  // stable field objects between renders, so cards that did not change are not drawn again
  const tree = useMemo(() => (builder ? fieldTree(builder) : { params: [], data: [] }), [builder]);

  if (!builder) {
    return (
      <div className={styles.builder}>
        <p role="alert" className={styles.alert}>
          เปิดตัวสร้างฟอร์มไม่ได้: {opened.ok ? "" : opened.error} — กด &quot;แก้ไข JSON&quot; เพื่อแก้ไฟล์
        </p>
      </div>
    );
  }

  const current = selected ? findField(builder, selected) : null;

  /** Keep a model edit and hand the files to the editor; a refusal shows its Thai reason and changes nothing. */
  function apply<T>(result: { ok: true; value: T } | { ok: false; error: string }, next: (v: T) => Builder) {
    if (!result.ok) return setMessage(result.error);
    const b = next(result.value);
    setBuilder(b);
    setMessage(null);
    // only files whose values changed since the builder opened: a hand-formatted file stays as it is
    for (const f of changedFiles(b)) touched.current.add(f.name);
    const now = serialize(b);
    onChange(Object.fromEntries([...touched.current].map((name) => [name, now[name] ?? null])));
  }

  function add(kind: Kind, target: Target) {
    apply(addField(builder!, target.section, target.parentKeys, target.index, kind), ({ builder: b, path }) => {
      setSelected(path);
      setSection(target.section);
      return b;
    });
  }

  /** The palette's Enter or click: the end of the selected group/table, or of the section in use. */
  function addHere(kind: Kind) {
    const parent = current && (current.kind === "group" || current.kind === "table") ? current : null;
    add(
      kind,
      parent
        ? { section: parent.path.section, parentKeys: parent.path.keys, index: parent.children.length }
        : { section, parentKeys: [], index: tree[section].length },
    );
  }

  function move(from: FieldPath, to: Target) {
    apply(moveField(builder!, from, to), ({ builder: b, path }) => {
      setSelected(path);
      return b;
    });
  }

  /** The draft as it is now: the templates as opened, the builder's files as edited. */
  const draftNow = () => {
    const out = { ...files };
    for (const [file, text] of Object.entries(serialize(builder!))) if (text !== null) out[file] = text;
    return out;
  };

  function rename(key: string) {
    if (!selected) return;
    const used = references(draftNow(), selected);
    if (
      used.length &&
      !window.confirm(`เทมเพลตอาจยังใช้ช่องนี้: ${used.join(", ")}\nเปลี่ยนชื่อแล้วตัวสร้างฟอร์มจะไม่แก้ไฟล์เหล่านั้นให้ ต้องแก้เอง — ทำต่อ?`)
    ) {
      return;
    }
    apply(renameField(builder!, selected, key), ({ builder: b, path }) => {
      setSelected(path);
      return b;
    });
  }

  function remove(path: FieldPath) {
    const field = findField(builder!, path);
    if (!field) return;
    const used = references(draftNow(), path);
    const name = field.props.label ?? field.key;
    const question = used.length
      ? `ลบช่อง "${name}"? เทมเพลตอาจยังใช้ช่องนี้: ${used.join(", ")} — ตัวสร้างฟอร์มจะไม่แก้ไฟล์เหล่านั้นให้`
      : `ลบช่อง "${name}"?`;
    if (!window.confirm(question)) return;
    apply(removeField(builder!, path), (b) => {
      if (selected && selected.section === path.section && selected.keys.join("/") === path.keys.join("/")) setSelected(null);
      return b;
    });
  }

  return (
    <div className={styles.builder}>
      {archived && <p className={styles.alert}>รายงานนี้ถูก archive แล้ว ดูฟอร์มได้อย่างเดียว</p>}
      {!exact && <p className={styles.alert}>browser นี้อ่านตัวเลขแบบตรงทุกหลักไม่ได้ จึงแก้ฟอร์มไม่ได้ — ใช้ Chrome/Edge รุ่นใหม่</p>}
      {builder.warnings.map((w) => (
        <p key={w} className={styles.warning}>
          {w}
        </p>
      ))}
      {message && (
        <p role="alert" className={styles.alert}>
          {message}
        </p>
      )}
      <div className={styles.main}>
        <BuilderDnd builder={builder} tree={tree} readOnly={readOnly} onMove={move} onAdd={add} onMessage={setMessage}>
          {readOnly ? (
            <div />
          ) : (
            <aside className={styles.palette} aria-label="ชนิดช่อง">
              <h3>เพิ่มช่อง</h3>
              <p className={styles.hint}>ลากลงฟอร์ม หรือกด Enter เพื่อเพิ่มท้าย{section === "params" ? "ข้อมูลเอกสาร" : "ข้อมูล"}</p>
              {DATA_KINDS.map((kind) => (
                <PaletteItem
                  key={kind}
                  kind={kind}
                  disabled={
                    section === "params" && !PARAM_KINDS.includes(kind) && !(current?.kind === "group" || current?.kind === "table")
                  }
                  onAdd={() => addHere(kind)}
                />
              ))}
            </aside>
          )}
          <BuilderCanvas
            tree={tree}
            selected={selected}
            readOnly={readOnly}
            onSelect={(path) => {
              setSelected(path);
              setSection(path.section);
            }}
            onSection={setSection}
            onRemove={remove}
          />
        </BuilderDnd>
        <aside className={styles.panel} aria-label="คุณสมบัติของช่อง">
          {current ? (
            <PropsPanel
              key={current.pointer}
              field={current}
              readOnly={readOnly}
              siblings={siblingKeys(tree, current)}
              places={places(builder, tree, current)}
              onMoveTo={(parentKeys) => {
                const count = parentKeys.length
                  ? (findField(builder, { section: current.path.section, keys: parentKeys })?.children.length ?? 0)
                  : tree[current.path.section].length;
                move(current.path, { section: current.path.section, parentKeys, index: count });
              }}
              onEdit={(patch: FieldProps) => {
                if (selected) apply(setProps(builder, selected, patch), (b) => b);
              }}
              onRename={rename}
            />
          ) : (
            <p className={styles.hint}>เลือกช่องในฟอร์มเพื่อแก้ป้าย กติกา และความกว้าง</p>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The issue form as the lead will see it, from the files as they are now; it checks and never sends. */
export function FormPreview({ files, templateId }: { files: Record<string, string>; templateId: string }) {
  let source: IssueSource | null = null;
  try {
    const report = JSON.parse(files["report.json"] ?? "") as { data?: { schema?: string; samples?: string[] } };
    const schemaJson = report.data?.schema ? files[report.data.schema] : undefined;
    const sample = report.data?.samples?.[0];
    if (schemaJson) {
      JSON.parse(schemaJson);
      source = {
        version: 0,
        reportJson: files["report.json"],
        schemaJson,
        sampleJson: sample ? files[sample] : undefined,
        formJson: files[FORM_FILE],
      };
    }
  } catch {
    source = null;
  }
  if (!source) {
    return <p className={styles.hint}>แสดงตัวอย่างฟอร์มไม่ได้: report.json หรือ schema ยังไม่ใช่ JSON ที่ถูกต้อง</p>;
  }
  // a new form whenever the fields change, so values never point at fields that are gone
  const key = `${source.reportJson.length}-${source.schemaJson.length}-${source.formJson?.length ?? 0}`;
  return <IssueForm key={key} templateId={templateId} source={source} onPdf={() => undefined} preview />;
}

/** The section root and every group/table the field may move into (its current place included). */
function places(b: Builder, tree: { params: BuilderField[]; data: BuilderField[] }, field: BuilderField): Place[] {
  const section = field.path.section;
  const out: Place[] = [{ label: section === "params" ? "ข้อมูลเอกสาร" : "ข้อมูล (ระดับบนสุด)", parentKeys: [] }];
  const walk = (fields: BuilderField[], trail: string) =>
    fields.forEach((f) => {
      if (f.kind !== "group" && f.kind !== "table") return;
      const label = `${trail}${f.props.label ?? f.key}`;
      out.push({ label, parentKeys: f.path.keys });
      walk(f.children, `${label} › `);
    });
  walk(tree[section], "");
  const here = field.path.keys.slice(0, -1).join("/");
  return out.filter(
    (pl) => pl.parentKeys.join("/") === here || canMove(b, field.path, { section, parentKeys: pl.parentKeys, index: 0 }) === null,
  );
}

function siblingKeys(tree: { params: BuilderField[]; data: BuilderField[] }, field: BuilderField): string[] {
  let list = tree[field.path.section];
  for (const key of field.path.keys.slice(0, -1)) list = list.find((f) => f.key === key)?.children ?? [];
  return list.map((f) => f.key).filter((k) => k !== field.key);
}
