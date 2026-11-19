"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { prepareDraft, saveFile } from "@/lib/actions/draft";
import { readBlocks } from "@/lib/doc-blocks";
import { record, redo, startHistory, undo, type History } from "@/lib/doc-edit";
import type { Scope } from "@/lib/doc-sample";
import { problemMessage } from "@/lib/messages";
import { parseParams } from "@/lib/params";

import styles from "./Designer.module.css";
import { PdfModal } from "./PdfModal";
import { Workbench } from "./Workbench";

export type DesignerProps = {
  templateId: string;
  name: string;
  revision: number;
  files: Record<string, string>; // the saved draft's text files
  assets: string[];
  archived: boolean;
  params: string; // default params for the PDF preview and the sample (JSON text)
};

export type DesignerApi = {
  src: string;
  edit: (src: string) => void; // one undo step
  report: string; // report.json as the designer has it (page margins)
  editReport: (reportJson: string) => void; // one undo step
  readOnly: boolean;
};

/** What the designer edits: template.html, and report.json for the page margins (SPEC v1.7 รอบแก้ข้อ 6). */
type Doc = { html: string; report: string };
const sameDoc = (a: Doc, b: Doc) => a.html === b.html && a.report === b.report;

/** Ctrl/Cmd shortcuts are the page's unless the user is typing somewhere. */
const typing = (e: KeyboardEvent) => {
  const t = e.composedPath()[0] as HTMLElement | undefined; // e.target is the paper's host for keys typed inside it
  return !!t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || !!t.closest(".cm-editor"));
};

/**
 * The Document Designer page (SPEC-studio v1.7): template.html on an A4 paper, its own save, Preview pdf in a modal,
 * undo/redo over whole sources that a save does not clear. `children` draws the panels around the paper (T7–T9).
 */
export function DesignerPage(props: DesignerProps & { children?: (api: DesignerApi) => React.ReactNode }) {
  const { templateId, name, files, archived, params } = props;
  const router = useRouter();
  const first: Doc = { html: files["template.html"] ?? "", report: files["report.json"] ?? "{}" };
  const [history, setHistory] = useState<History<Doc>>(() => startHistory(first));
  const [saved, setSaved] = useState<Doc>(first);
  const [revision, setRevision] = useState(props.revision);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdf, setPdf] = useState(false);
  const [sample, setSample] = useState<Scope | null>(null);
  const [sampleOn, setSampleOn] = useState(false);
  const [zoom, setZoom] = useState(1);

  const src = history.now.html;
  const report = history.now.report;
  const dirty = !sameDoc(history.now, saved);
  const readOnly = archived || conflict;
  const blocks = useMemo(() => readBlocks(src), [src]);
  const shown = useMemo(() => ({ ...files, "report.json": report }), [files, report]);

  const edit = useCallback((next: string) => setHistory((h) => record(h, { ...h.now, html: next }, sameDoc)), []);
  const editReport = useCallback((next: string) => setHistory((h) => record(h, { ...h.now, report: next }, sameDoc)), []);

  /** Writes the files that changed (template.html, then report.json), each with the revision the last one gave. */
  async function save(): Promise<boolean> {
    if (!dirty) return true;
    setSaving(true);
    setError(null);
    const now = history.now;
    let rev = revision;
    const writes: [string, keyof Doc][] = [
      ["template.html", "html"],
      ["report.json", "report"],
    ];
    for (const [name, key] of writes) {
      if (now[key] === saved[key]) continue;
      const out = await saveFile(templateId, name, now[key], rev);
      if (!out.ok) {
        setSaving(false);
        if (out.problem.status === 412) setConflict(true);
        else setError(problemMessage(out.problem));
        return false;
      }
      rev = out.data.revision;
      setRevision(rev);
      setSaved((s) => ({ ...s, [key]: now[key] }));
    }
    setSaving(false);
    return true;
  }

  async function previewPdf() {
    if (dirty) {
      if (!window.confirm("Preview pdf ใช้ draft ที่บันทึกแล้ว — บันทึกแล้วดู PDF?")) return;
      if (!(await save())) return;
    }
    setPdf(true);
  }

  async function toggleSample() {
    if (sampleOn) return setSampleOn(false);
    if (!sample) {
      const parsed = parseParams(params);
      const out = await prepareDraft(templateId, "error" in parsed ? {} : parsed.params);
      if (!out.ok) return setError(`แสดงข้อมูลตัวอย่างไม่ได้: ${problemMessage(out.problem)}`);
      const p = out.data;
      // a list loops over its rows in the template (`for item in lists.items`) and still has `.groups`
      const lists = Object.fromEntries(
        Object.entries(p.lists).map(([k, v]) => [k, Object.assign([...v.rows], { rows: v.rows, groups: v.groups })]),
      );
      setSample({ params: p.params, data: p.data, lists, totals: p.totals });
    }
    setSampleOn(true);
  }

  function leave() {
    if (dirty && !window.confirm("มีการแก้ใน designer ที่ยังไม่บันทึก ออกโดยไม่บันทึก?")) return;
    router.push(`/templates/${templateId}`);
  }

  // undo/redo/save from the keyboard; leaving the tab with unsaved edits asks
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || typing(e)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) setHistory((h) => undo(h));
      else if ((k === "z" && e.shiftKey) || k === "y") setHistory((h) => redo(h));
      else if (k === "s") void save();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const api: DesignerApi = { src, edit, report, editReport, readOnly };

  return (
    <div className={styles.designer}>
      <div className={styles.toolbar}>
        <b>{name}</b>
        <code>{templateId}</code>
        <span className={styles.mode}>Document Designer</span>
        <span className={styles.spacer} />
        <label className={styles.toggle}>
          <input type="checkbox" checked={sampleOn} onChange={() => void toggleSample()} /> แสดงข้อมูลตัวอย่าง
        </label>
        <select aria-label="ขนาดที่แสดง" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
          {[0.5, 0.75, 1, 1.25, 1.5].map((z) => (
            <option key={z} value={z}>
              {Math.round(z * 100)}%
            </option>
          ))}
        </select>
        <button type="button" className={styles.secondary} onClick={() => setHistory(undo)} disabled={!history.past.length || readOnly} title="Ctrl+Z">
          เลิกทำ
        </button>
        <button type="button" className={styles.secondary} onClick={() => setHistory(redo)} disabled={!history.future.length || readOnly} title="Ctrl+Shift+Z">
          ทำซ้ำ
        </button>
        <button type="button" className={styles.secondary} onClick={() => void previewPdf()}>
          Preview pdf
        </button>
        <span role="status" className={styles.saveState}>
          {saving ? "กำลังบันทึก…" : dirty ? "ยังไม่บันทึก" : "บันทึกแล้ว"}
        </span>
        <button type="button" onClick={() => void save()} disabled={!dirty || saving || readOnly}>
          บันทึก
        </button>
        <button type="button" className={styles.secondary} onClick={leave}>
          กลับไปแก้ code
        </button>
      </div>
      {archived && <p className={styles.alert}>รายงานนี้ถูก archive แล้ว ดูได้อย่างเดียว</p>}
      {conflict && (
        <p role="alert" className={styles.alert}>
          มีคนแก้ draft นี้ก่อน การแก้ใน designer ยังไม่ถูกบันทึก{" "}
          <button type="button" onClick={() => window.location.reload()}>
            โหลดใหม่
          </button>{" "}
          (การแก้ที่ยังไม่บันทึกจะหาย)
        </p>
      )}
      {error && (
        <p role="alert" className={styles.alert}>
          {error}
        </p>
      )}
      <div className={styles.main}>
        {props.children ? (
          props.children(api)
        ) : (
          <Workbench
            src={src}
            blocks={blocks}
            edit={edit}
            onReport={editReport}
            readOnly={readOnly}
            files={shown}
            templateId={templateId}
            assets={props.assets}
            sample={sampleOn ? sample : null}
            zoom={zoom}
          />
        )}
      </div>
      {pdf && <PdfModal templateId={templateId} params={params} onClose={() => setPdf(false)} />}
    </div>
  );
}
