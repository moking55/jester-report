"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { deleteFile, saveFile, validateDraft } from "@/lib/actions/draft";
import { saveSteps } from "@/lib/builder-save";
import { canEditExactly } from "@/lib/json-exact";
import { problemMessage } from "@/lib/messages";
import {
  addField,
  canMove,
  changedFiles,
  DATA_KINDS,
  fieldTree,
  findField,
  markSaved,
  moveField,
  openBuilder,
  PARAM_KINDS,
  removeField,
  renameField,
  setProps,
  type Builder,
  type BuilderField,
  type FieldPath,
  type FieldProps,
  type Kind,
  type Section,
  type Target,
} from "@/lib/schema-edit";
import type { TextFile } from "@/lib/workspace";

import { BuilderCanvas, BuilderDnd, PaletteItem } from "./BuilderCanvas";
import styles from "./FormBuilder.module.css";
import { PropsPanel, type Place } from "./PropsPanel";

type Props = {
  templateId: string;
  name: string;
  revision: number;
  files: TextFile[];
  archived: boolean;
};

const samePath = (a: FieldPath | null, b: FieldPath | null) =>
  !!a && !!b && a.section === b.section && a.keys.join("/") === b.keys.join("/");

/** "ออกแบบฟอร์ม" (SPEC-studio v1.6): edit parameters and the data schema by dragging fields; files stay the truth. */
export function FormBuilder({ templateId, name, revision: startRevision, files, archived }: Props) {
  const router = useRouter();
  const texts = useMemo(() => Object.fromEntries(files.map((f) => [f.name, f.content])), [files]);
  const opened = useMemo(() => openBuilder(texts), [texts]);
  const exact = useMemo(() => canEditExactly(), []);
  const readOnly = archived || !exact || !opened.ok;

  const [builder, setBuilder] = useState<Builder | null>(opened.ok ? opened.value : null);
  const [lastSaved, setLastSaved] = useState<Builder | null>(opened.ok ? opened.value : null); // "ยกเลิกการแก้" goes back here
  const [revision, setRevision] = useState(startRevision);
  const [selected, setSelected] = useState<FieldPath | null>(null);
  const [section, setSection] = useState<Section>("data"); // where the palette's Enter adds
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [problems, setProblems] = useState<number | null>(null);

  // stable field objects between renders, so cards that did not change are not drawn again
  const tree = useMemo(() => (builder ? fieldTree(builder) : { params: [], data: [] }), [builder]);

  if (!builder) {
    return (
      <div className={styles.builder}>
        <Toolbar name={name} templateId={templateId} onBack={() => router.push(`/templates/${templateId}`)} />
        <p role="alert" className={styles.alert}>
          เปิด builder ไม่ได้: {opened.ok ? "" : opened.error} — แก้ไฟล์ในหน้าแก้ code ก่อน
        </p>
      </div>
    );
  }

  const changes = changedFiles(builder);
  const dirty = changes.length > 0;
  const current = selected ? findField(builder, selected) : null;

  /** Apply a model edit; a refusal shows its Thai reason and changes nothing. */
  function apply<T>(result: { ok: true; value: T } | { ok: false; error: string }, next: (v: T) => void) {
    if (result.ok) {
      next(result.value);
      setMessage(null);
    } else setMessage({ kind: "error", text: result.error });
  }

  function add(kind: Kind, target: { section: Section; parentKeys: string[]; index: number }) {
    apply(addField(builder!, target.section, target.parentKeys, target.index, kind), ({ builder: b, path }) => {
      setBuilder(b);
      setSelected(path);
      setSection(target.section);
    });
  }

  /** The palette's Enter or click: the end of the selected group/table, or of the section in use. */
  function addHere(kind: Kind) {
    const parent =
      current && (current.kind === "group" || current.kind === "table") ? current.path : null;
    const target = parent
      ? { section: parent.section, parentKeys: parent.keys, index: current!.children.length }
      : { section, parentKeys: [], index: tree[section].length };
    add(kind, target);
  }

  function move(from: FieldPath, to: Target) {
    apply(moveField(builder!, from, to), ({ builder: b, path }) => {
      setBuilder(b);
      setSelected(path);
    });
  }

  function edit(patch: FieldProps) {
    if (!selected) return;
    apply(setProps(builder!, selected, patch), setBuilder);
  }

  function rename(key: string) {
    if (!selected) return;
    apply(renameField(builder!, selected, key), ({ builder: b, path }) => {
      setBuilder(b);
      setSelected(path);
    });
  }

  function remove(path: FieldPath) {
    const field = findField(builder!, path);
    if (!field || !window.confirm(`ลบช่อง "${field.props.label ?? field.key}"?`)) return;
    apply(removeField(builder!, path), (b) => {
      setBuilder(b);
      if (samePath(selected, path)) setSelected(null);
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const out = await saveSteps(changes, revision, {
      put: (file, text, rev) => saveFile(templateId, file, text, rev),
      remove: (file, rev) => deleteFile(templateId, file, rev),
    });
    setRevision(out.revision);
    const written = markSaved(builder!, out.saved);
    setBuilder(written);
    if (out.ok) {
      setLastSaved(written);
      setMessage({ kind: "info", text: `บันทึกแล้ว ${out.saved.length} ไฟล์` });
      const checked = await validateDraft(templateId);
      setProblems(checked.ok ? checked.data.problems.length : null);
    } else {
      // part old, part new on the server: "ยกเลิกการแก้" has no clean point to go back to, only a reload
      if (out.saved.length) setLastSaved(null);
      if (out.conflict) setConflict(true);
      else {
        const done = out.saved.length ? `บันทึกแล้ว: ${out.saved.join(", ")} · ` : "";
        const why = out.problem ? problemMessage(out.problem) : "ส่งไม่สำเร็จ";
        setMessage({ kind: "error", text: `${done}ยังไม่บันทึก: ${out.pending.join(", ")} (${why}) — กดบันทึกอีกครั้งได้` });
      }
    }
    setSaving(false);
  }

  function leave() {
    if (dirty && !window.confirm("มีการแก้ในฟอร์มที่ยังไม่บันทึก ออกโดยไม่บันทึก?")) return;
    router.push(`/templates/${templateId}`);
  }

  function discard() {
    if (!lastSaved || !window.confirm("ยกเลิกการแก้ทั้งหมดตั้งแต่บันทึกครั้งล่าสุด?")) return;
    setBuilder(lastSaved);
    setSelected(null);
    setMessage(null);
  }

  return (
    <div className={styles.builder}>
      <Toolbar name={name} templateId={templateId} onBack={leave}>
        {problems !== null && (
          <span className={problems ? styles.problems : styles.saveState}>
            {problems ? `มี ${problems} problem — ดูในหน้าแก้ code` : "ไม่มี problem"}
          </span>
        )}
        <span role="status" className={styles.saveState}>
          {saving ? "กำลังบันทึก…" : dirty ? `ยังไม่บันทึก ${changes.length} ไฟล์` : "บันทึกแล้ว"}
        </span>
        <button type="button" className={styles.secondary} onClick={discard} disabled={!dirty || saving || readOnly || !lastSaved}>
          ยกเลิกการแก้
        </button>
        <button type="button" onClick={save} disabled={!dirty || saving || readOnly || conflict}>
          บันทึก
        </button>
      </Toolbar>
      {archived && <p className={styles.alert}>รายงานนี้ถูก archive แล้ว ดูฟอร์มได้อย่างเดียว</p>}
      {!exact && <p className={styles.alert}>browser นี้อ่านตัวเลขแบบตรงทุกหลักไม่ได้ จึงแก้ฟอร์มไม่ได้ — ใช้ Chrome/Edge รุ่นใหม่</p>}
      {conflict && (
        <p role="alert" className={styles.alert}>
          มีคนแก้ draft นี้ก่อน การแก้ในฟอร์มยังไม่ถูกบันทึกทั้งหมด{" "}
          <button type="button" onClick={() => window.location.reload()}>
            โหลดใหม่
          </button>{" "}
          (การแก้ที่ยังไม่บันทึกจะหาย)
        </p>
      )}
      {builder.warnings.map((w) => (
        <p key={w} className={styles.warning}>
          {w}
        </p>
      ))}
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? styles.alert : styles.info}>
          {message.text}
        </p>
      )}
      <div className={styles.main}>
        <BuilderDnd
          builder={builder}
          tree={tree}
          readOnly={readOnly}
          onMove={move}
          onAdd={(kind, to) => add(kind, to)}
          onMessage={(text) => setMessage(text ? { kind: "error", text } : null)}
        >
          {readOnly ? (
            <div />
          ) : (
            <aside className={styles.palette} aria-label="ชนิดช่อง">
              <h3>เพิ่มช่อง</h3>
              <p className={styles.hint}>
                ลากลงฟอร์ม หรือกด Enter เพื่อเพิ่มท้าย{section === "params" ? " ข้อมูลเอกสาร" : " ข้อมูล"}
              </p>
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
              onEdit={edit}
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

function Toolbar({
  name,
  templateId,
  onBack,
  children,
}: {
  name: string;
  templateId: string;
  onBack: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.toolbar}>
      <b>{name}</b>
      <code>{templateId}</code>
      <span className={styles.mode}>ออกแบบฟอร์ม</span>
      <span className={styles.spacer} />
      {children}
      <button type="button" className={styles.secondary} onClick={onBack}>
        กลับไปแก้ code
      </button>
    </div>
  );
}
