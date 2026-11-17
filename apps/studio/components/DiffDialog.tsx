"use client";

import { unifiedMergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { compare, type Change, type Snapshot } from "@/lib/diff";
import { problemMessage } from "@/lib/messages";
import type { Result } from "@/lib/workspace";

import styles from "./DiffDialog.module.css";
import { language } from "./Editor";
import dialogStyles from "./RenderDialog.module.css";

type Props = {
  title: string;
  /** What the change starts from and ends at, e.g. "published (v2)" → "draft". */
  fromLabel: string;
  toLabel: string;
  load: () => Promise<Result<{ from: Snapshot; to: Snapshot }>>;
  confirmLabel: string;
  /** Publishing nothing new is refused by the api, so the publish dialog turns its button off. */
  requireChanges?: boolean;
  onConfirm: (form: FormData) => void;
  onClose: () => void;
  children?: ReactNode; // extra form fields, e.g. the version note
};

const STATUS = { added: "เพิ่ม", removed: "ลบ", changed: "แก้" } as const;

/** Shows what a publish, rollback or reset would change, and asks for the go-ahead. */
export function DiffDialog({ title, fromLabel, toLabel, load, confirmLabel, requireChanges, onConfirm, onClose, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<{ from: Snapshot; to: Snapshot; changes: Change[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    let current = true;
    load().then((result) => {
      if (!current) return;
      if (!result.ok) return setError(problemMessage(result.problem));
      const changes = compare(result.data.from, result.data.to);
      setData({ ...result.data, changes });
      setSelected(changes.find((c) => c.kind === "file")?.name ?? null);
    });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once per opening
  }, []);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onConfirm(new FormData(e.currentTarget));
    dialog.current?.close();
  };
  const change = data?.changes.find((c) => c.name === selected && c.kind === "file");
  const blocked = !data || (requireChanges && data.changes.length === 0);

  return (
    <dialog ref={dialog} className={`${dialogStyles.dialog} ${styles.dialog}`} onClose={onClose} aria-label={title}>
      <form className={dialogStyles.form} onSubmit={submit}>
        <div className={dialogStyles.head}>
          <h2>{title}</h2>
          <button type="button" className={dialogStyles.close} onClick={() => dialog.current?.close()} aria-label="ปิด">
            ×
          </button>
        </div>
        <p className={dialogStyles.hint}>
          เทียบจาก <b>{fromLabel}</b> ไปเป็น <b>{toLabel}</b>
        </p>
        {error && <p className={styles.error}>{error}</p>}
        {!data && !error && <p className={dialogStyles.hint}>กำลังโหลด…</p>}
        {data && data.changes.length === 0 && <p className={styles.same}>ไม่มีอะไรเปลี่ยน ไฟล์และ asset ตรงกันทั้งหมด</p>}
        {data && data.changes.length > 0 && (
          <div className={styles.body}>
            <ul className={styles.list} aria-label="ไฟล์ที่ต่างกัน">
              {data.changes.map((c) => (
                <li key={`${c.kind}:${c.name}`}>
                  <button
                    type="button"
                    disabled={c.kind === "asset"}
                    aria-current={c.kind === "file" && c.name === selected ? "true" : undefined}
                    onClick={() => setSelected(c.name)}
                  >
                    <span className={styles[c.status]}>{STATUS[c.status]}</span> {c.name}
                  </button>
                </li>
              ))}
            </ul>
            {change ? (
              <FileDiff key={change.name} name={change.name} from={data.from} to={data.to} />
            ) : (
              <p className={dialogStyles.hint}>asset เทียบกันด้วย sha256 จึงแสดงเฉพาะชื่อและสถานะ</p>
            )}
          </div>
        )}
        {children}
        <div className={dialogStyles.buttons}>
          <button type="button" onClick={() => dialog.current?.close()}>
            ยกเลิก
          </button>
          <button type="submit" className={dialogStyles.primary} disabled={blocked}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

const contentOf = (side: Snapshot, name: string) => side.files.find((f) => f.name === name)?.content ?? "";

/** Read-only unified diff of one file: removed lines struck through above the lines that replace them. */
function FileDiff({ name, from, to }: { name: string; from: Snapshot; to: Snapshot }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: contentOf(to, name),
        extensions: [
          basicSetup,
          language(name),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          unifiedMergeView({ original: contentOf(from, name), mergeControls: false, collapseUnchanged: { margin: 3 } }),
        ],
      }),
    });
    return () => view.destroy();
  }, [name, from, to]);
  return <div ref={host} className={styles.view} aria-label={`ความต่างของ ${name}`} />;
}
