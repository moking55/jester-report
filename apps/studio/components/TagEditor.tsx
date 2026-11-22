"use client";

import { useRef, useState } from "react";

import {
  listTagUse,
  setDocumentTags,
  setTagColor,
  setTemplateTags,
  type TagResult,
} from "@/lib/actions/tags";
import { colorMap, withPending, type TagColor } from "@/lib/tags";

import { TagField } from "./TagField";

import styles from "./RenderDialog.module.css";

type Props = {
  /** What is being tagged: the api route differs, the dialog does not. */
  kind: "template" | "document";
  /** The template id, or the run id of a document. */
  id: string;
  /** What the dialog names in its title: the template's name, or the document's file name. */
  name: string;
  tags: string[];
  label?: string;
  className?: string;
};

/** A button that opens the tag dialog of one template or issued document: add, remove, colour, save. */
export function TagEditor({ kind, id, name, tags, label = "แก้ tag…", className }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(tags);
  const [typed, setTyped] = useState("");
  const [colors, setColors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open() {
    setValue(tags);
    setTyped("");
    setError(null);
    dialog.current?.showModal();
    // the colours of the tags already in use; a tag nobody has coloured is gray
    void listTagUse().then((uses) => setColors(colorMap(uses)));
  }

  async function changeColor(tag: string, color: TagColor) {
    setColors((c) => ({ ...c, [tag]: color })); // at once; the api confirms a moment later
    const result = await setTagColor(tag, color);
    if (!result.ok) setError(result.error);
  }

  async function save() {
    const final = withPending(value, typed);
    if (!final.ok) return setError(final.error);
    setBusy(true);
    setError(null);
    let result: TagResult;
    try {
      result = await (kind === "template" ? setTemplateTags(id, final.tags) : setDocumentTags(id, final.tags));
    } catch {
      result = { ok: false, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" };
    } finally {
      setBusy(false);
    }
    if (result.ok) dialog.current?.close();
    else setError(result.error);
  }

  return (
    <>
      <button type="button" className={className} onClick={open}>
        {label}
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-label={`แก้ tag ของ ${name}`} style={{ width: "min(520px, calc(100vw - 32px))" }}>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className={styles.head}>
            <h2>
              แก้ tag · <span>{name}</span>
            </h2>
            <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="ปิด">
              ×
            </button>
          </div>
          <TagField
            value={value}
            onChange={setValue}
            typed={typed}
            onTyped={setTyped}
            colors={colors}
            onColor={(tag, color) => void changeColor(tag, color)}
          />
          <p className={styles.hint}>
            ใส่ได้ไม่เกิน 10 อัน อันละ 1–30 ตัวอักษร (ไม่ใช้จุลภาค) · ตัวพิมพ์ใหญ่เล็กถือว่าต่างกัน · กดชื่อ tag เพื่อเลือกสี
          </p>
          <div className={styles.buttons}>
            <button type="button" onClick={() => dialog.current?.close()}>
              ยกเลิก
            </button>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </form>
      </dialog>
    </>
  );
}
