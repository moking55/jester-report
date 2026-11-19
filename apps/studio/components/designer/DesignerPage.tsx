"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { prepareDraft, saveFile } from "@/lib/actions/draft";
import { isImageName, safeAssetName } from "@/lib/asset-name";
import { changePage, pageOf, PAPER_MM, sizeLabel, type PageSize, type PageSpec } from "@/lib/paper";
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
  upload: (file: File) => Promise<string | null>; // an image into the draft's assets
  part: Part; // the file being edited (template.html, header.html or footer.html)
  setPart: (part: Part) => void;
  readOnly: boolean;
};

/** What the designer edits: template.html, and report.json for the page margins (SPEC v1.7 รอบแก้ข้อ 6). */
type Doc = { html: string; report: string; header: string | null; footer: string | null }; // null: no such file yet
const sameDoc = (a: Doc, b: Doc) => a.html === b.html && a.report === b.report && a.header === b.header && a.footer === b.footer;
export type Part = "body" | "header" | "footer"; // the file the paper is editing

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
  const first: Doc = {
    html: files["template.html"] ?? "",
    report: files["report.json"] ?? "{}",
    header: files["header.html"] ?? null,
    footer: files["footer.html"] ?? null,
  };
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
  const [assets, setAssets] = useState(props.assets);

  const [part, setPart] = useState<Part>("body"); // body: template.html; header / footer: the zone being edited

  const report = history.now.report;
  const src = part === "body" ? history.now.html : (history.now[part] ?? ""); // the file being edited
  const dirty = !sameDoc(history.now, saved);
  const readOnly = archived || conflict;
  const blocks = useMemo(() => readBlocks(src, part !== "body"), [src, part]);
  const pageSpec = useMemo(() => pageOf(report), [report]);
  const shown = useMemo(() => {
    const { html, header, footer } = history.now;
    const out: Record<string, string> = { ...files, "template.html": html, "report.json": report };
    if (header !== null) out["header.html"] = header;
    if (footer !== null) out["footer.html"] = footer;
    return out;
  }, [files, history.now, report]);

  const edit = useCallback(
    (next: string) =>
      setHistory((h) => record(h, part === "body" ? { ...h.now, html: next } : { ...h.now, [part]: next }, sameDoc)),
    [part],
  );
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
      ["header.html", "header"],
      ["footer.html", "footer"],
      ["report.json", "report"],
    ];
    for (const [name, key] of writes) {
      const text = now[key];
      if (text === saved[key] || text === null) continue; // unchanged (a file is never deleted from here)
      const out = await saveFile(templateId, name, text, rev);
      if (!out.ok) {
        setSaving(false);
        if (out.problem.status === 412) setConflict(true);
        else setError(problemMessage(out.problem));
        return false;
      }
      rev = out.data.revision;
      setRevision(rev);
      setSaved((s) => ({ ...s, [key]: text }));
    }
    setSaving(false);
    return true;
  }

  /**
   * An image into the draft's assets under a name the api takes (SPEC v1.7 รอบแก้ข้อ 9); the draft's new revision
   * is kept, so the next save does not meet 412. Edits not saved yet stay as they are. Its name, or null.
   */
  async function uploadImage(file: File): Promise<string | null> {
    const name = safeAssetName(file.name, assets);
    if (!name || !isImageName(name)) {
      setError(`อัปโหลด ${file.name} ไม่ได้: ใช้รูป png jpg gif svg webp avif หรือ bmp`);
      return null;
    }
    setError(null);
    const form = new FormData();
    form.set("file", name === file.name ? file : new File([file], name, { type: file.type }));
    form.set("revision", String(revision));
    const response = await fetch(`/assets/${templateId}`, { method: "POST", body: form });
    if (response.status === 401) {
      router.push("/login");
      return null;
    }
    const body = (await response.json()) as { revision: number; asset: { name: string } } & Parameters<typeof problemMessage>[0];
    if (!response.ok) {
      if (response.status === 412) setConflict(true);
      else setError(`อัปโหลด ${file.name} ไม่ได้: ${problemMessage(body)}`);
      return null;
    }
    setRevision(body.revision);
    setAssets((a) => (a.includes(body.asset.name) ? a : [...a, body.asset.name]));
    return body.asset.name;
  }

  /** The toolbar's size, orientation and roll width: written into report.json's page (one undo step). */
  function setPageField(change: Partial<PageSpec>) {
    const next = changePage(report, change);
    if (next === null) return setError("report.json อ่านไม่ได้ หรือเปลี่ยนระหว่างกระดาษแผ่นกับม้วนไม่ได้ — สร้างรายงานใหม่");
    setError(null);
    editReport(next);
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

  const api: DesignerApi = { src, edit, report, editReport, upload: uploadImage, part, setPart, readOnly };

  return (
    <div className={styles.designer}>
      <div className={styles.toolbar}>
        <b>{name}</b>
        <code>{templateId}</code>
        <span className={styles.mode}>Document Designer</span>
        {pageSpec.layout === "free" && <span className={styles.mode}>แบบอิสระ</span>}
        {part !== "body" && (
          <>
            <span className={styles.mode}>กำลังแก้ {part}.html (ทุกหน้าเหมือนกัน)</span>
            <button type="button" onClick={() => setPart("body")}>
              กลับไปแก้เนื้อหา
            </button>
          </>
        )}
        <span className={styles.spacer} />
        <label className={styles.toggle}>
          ขนาดกระดาษ
          <select
            aria-label="ขนาดกระดาษ"
            value={pageSpec.size === "roll" ? `roll${pageSpec.rollWidthMm ?? 80}` : pageSpec.size}
            disabled={readOnly}
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith("roll")) setPageField({ size: "roll", rollWidthMm: v === "roll58" ? 58 : 80 });
              else setPageField({ size: v as PageSize });
            }}
          >
            {pageSpec.size === "roll"
              ? [58, 80].map((w) => (
                  <option key={w} value={`roll${w}`}>
                    {sizeLabel("roll", w)}
                  </option>
                ))
              : [...Object.keys(PAPER_MM), "custom"].map((n) => (
                  <option key={n} value={n}>
                    {sizeLabel(n as PageSize)}
                  </option>
                ))}
          </select>
        </label>
        {pageSpec.size === "custom" && (
          <>
            <label className={styles.toggle}>
              กว้าง
              <input
                aria-label="กว้าง (mm)"
                className={styles.mm}
                type="number"
                min={25}
                max={1000}
                defaultValue={pageSpec.widthMm}
                key={`w${pageSpec.widthMm}`}
                disabled={readOnly}
                onBlur={(e) => Number(e.target.value) !== pageSpec.widthMm && setPageField({ widthMm: Number(e.target.value) })}
              />
            </label>
            <label className={styles.toggle}>
              สูง
              <input
                aria-label="สูง (mm)"
                className={styles.mm}
                type="number"
                min={25}
                max={2000}
                defaultValue={pageSpec.heightMm}
                key={`h${pageSpec.heightMm}`}
                disabled={readOnly}
                onBlur={(e) => Number(e.target.value) !== pageSpec.heightMm && setPageField({ heightMm: Number(e.target.value) })}
              />
              mm
            </label>
          </>
        )}
        {pageSpec.size !== "roll" && (
          <select
            aria-label="แนวกระดาษ"
            value={pageSpec.orientation}
            disabled={readOnly}
            onChange={(e) => setPageField({ orientation: e.target.value as "portrait" | "landscape" })}
          >
            <option value="portrait">แนวตั้ง</option>
            <option value="landscape">แนวนอน</option>
          </select>
        )}
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
            part={part}
            onZone={readOnly ? undefined : setPart}
            key={part} // selection and drag state belong to the file being edited
            readOnly={readOnly}
            files={shown}
            templateId={templateId}
            assets={assets}
            onUpload={readOnly ? undefined : uploadImage}
            sample={sampleOn ? sample : null}
            zoom={zoom}
          />
        )}
      </div>
      {pdf && <PdfModal templateId={templateId} params={params} onClose={() => setPdf(false)} />}
    </div>
  );
}
