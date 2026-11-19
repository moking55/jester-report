"use client";

import { useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useImmer } from "use-immer";

import {
  deleteAsset,
  deleteFile,
  latestRun,
  loadDraft,
  prepareDraft,
  saveFile,
  validateDraft,
} from "@/lib/actions/draft";
import { setArchived } from "@/lib/actions/templates";
import { getVersion, listVersions, publishDraft, resetDraft } from "@/lib/actions/versions";
import { EMPTY, type Snapshot } from "@/lib/diff";
import { problemMessage } from "@/lib/messages";
import { clampSizes, DEFAULT_SIZES, type PaneSizes, readSizes } from "@/lib/panes";
import { defaultParams, parseParams } from "@/lib/params";
import type { Problem } from "@/lib/api-core";
import {
  assetAdded,
  assetRemoved,
  failed,
  fileAdded,
  fileRemoved,
  initialState,
  reloaded,
  saved,
  setDirty,
  validated,
  type Asset,
  type Draft,
  type IssueSource,
  type Result,
} from "@/lib/workspace";

import { AssetPreview } from "./AssetPreview";
import { DiffDialog } from "./DiffDialog";
import { Editor, type EditorHandle } from "./Editor";
import { FieldsTab } from "./FieldsTab";
import { FilePanel } from "./FilePanel";
import { IssueForm, type IssuedPdf } from "./IssueForm";
import { JsonTree } from "./JsonTree";
import { ProblemList } from "./ProblemList";
import { Resizer } from "./Resizer";
import { DeveloperDialog } from "./DeveloperDialog";
import { RunDetails } from "./RunDetails";
import { TemplateMenu } from "./TemplateMenu";
import { VersionsPanel } from "./VersionsPanel";
import styles from "./Workspace.module.css";

const SIZES_KEY = "jester.workspace.panes";

const TABS = [
  ["problems", "Problems"],
  ["fields", "ช่องข้อมูล"],
  ["prepared", "Prepared data"],
  ["provenance", "Provenance"],
  ["versions", "Versions"],
] as const;

export function Workspace({
  draft,
  name,
  today,
  archived = false,
  canIssue = false,
  issue = null,
}: {
  draft: Draft;
  name: string;
  today: string;
  archived?: boolean;
  canIssue?: boolean; // a published, active template: the "ออกเอกสาร" button shows
  issue?: IssueSource | null; // set: the issue mode (form + PDF), no code view
}) {
  const [state, update] = useImmer(() =>
    initialState(draft, defaultParams(draft.files.find((f) => f.name === "report.json")?.content, today)),
  );
  const editor = useRef<EditorHandle>(null);
  const previewForm = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const writing = useRef(false);
  const [devBody, setDevBody] = useState(""); // the issue form's request, for the developer dialog
  const [showDev, setShowDev] = useState(false);
  const main = useRef<HTMLDivElement>(null);
  const [assetPreview, setAssetPreview] = useState<string | null>(null); // an image asset shown in the editor pane
  const [publishing, setPublishing] = useState(false); // the publish dialog is open
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null); // for the dialog's label
  const [previewed, setPreviewed] = useState(false); // the empty preview pane shows a hint until the first Preview
  const [sizes, setSizes] = useState<PaneSizes>(DEFAULT_SIZES);
  const [issued, setIssued] = useState<IssuedPdf | null>(null); // the last PDF of the issue form

  // an issued PDF lives in a blob URL: free the old one when a new PDF replaces it or the page goes
  useEffect(() => () => {
    if (issued) URL.revokeObjectURL(issued.url);
  }, [issued]);

  // pane sizes are a per-browser convenience; storage can be missing or blocked, then the defaults stay
  useEffect(() => {
    try {
      const saved = readSizes(localStorage.getItem(SIZES_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage exists only after hydration
      setSizes(saved);
    } catch {
      // keep the defaults
    }
  }, []);

  function resize(change: (rect: DOMRect, current: PaneSizes, pad: number) => Partial<PaneSizes>) {
    const rect = main.current?.getBoundingClientRect();
    if (!rect) return;
    const pad = parseFloat(getComputedStyle(main.current!).paddingLeft) || 0; // 0 edge to edge, 8 for classic
    setSizes((current) => {
      const next = clampSizes({ ...current, ...change(rect, current, pad) }, rect);
      try {
        localStorage.setItem(SIZES_KEY, JSON.stringify(next));
      } catch {
        // not saved; it still applies until the page is left
      }
      return next;
    });
  }

  /**
   * One draft write at a time. Every write sends the revision this tab knows; two at once (Ctrl+S during a
   * slow upload) would make the second a 412 against this very tab. The ref guards clicks within one render.
   */
  async function exclusive<T>(write: () => Promise<T | false>): Promise<T | false> {
    if (writing.current || state.conflict) return false;
    writing.current = true;
    update((s) => {
      s.saving = true;
    });
    try {
      return await write();
    } catch {
      // the call itself failed (Studio unreachable, body too big): say so instead of staying "saving"
      update((s) => {
        s.error = "บันทึกไม่สำเร็จ ติดต่อ Studio ไม่ได้ หรือไฟล์ใหญ่เกินไป";
      });
      return false;
    } finally {
      writing.current = false;
      update((s) => {
        s.saving = false;
      });
    }
  }

  /** Saves every dirty file in turn: the revision after the last save, or false when one failed (412, 422, …). */
  const saveAll = () =>
    exclusive(async () => {
      let revision = state.revision;
      for (const file of state.dirty) {
        const content = editor.current?.content(file);
        if (content === undefined) continue;
        const result = await saveFile(state.templateId, file, content, revision);
        if (!result.ok) {
          update(failed(result.problem, problemMessage(result.problem)));
          return false;
        }
        revision = result.data.revision;
        const stillDirty = editor.current?.markSaved(file, content) ?? false;
        update(saved(file, revision, stillDirty));
      }
      return revision; // `state` in this closure is older than the saves above
    });

  // what publishing would change: the published version (or nothing yet) against the draft as typed
  async function publishDiff(): Promise<Result<{ from: Snapshot; to: Snapshot }>> {
    const versions = await listVersions(state.templateId);
    if (!versions.ok) return versions;
    const published = versions.data.find((v) => v.isPublished);
    setPublishedVersion(published?.version ?? null);
    const from = published ? await getVersion(state.templateId, published.version) : { ok: true as const, data: EMPTY };
    return from.ok ? { ok: true, data: { from: from.data, to: typed() } } : from;
  }

  async function publish(note: string) {
    const revision = await saveAll();
    if (revision === false) return;
    const result = await publishDraft(state.templateId, revision, note);
    if (!result.ok && result.problem.code === "REVISION_CONFLICT") {
      // the api answers 412 also when this exact draft is already the newest version: tell them apart
      const draft = await loadDraft(state.templateId);
      if (draft.ok && draft.data.revision === revision) {
        update((s) => {
          s.error = "draft นี้ตรงกับเวอร์ชันล่าสุดอยู่แล้ว ไม่มีอะไรใหม่ให้ publish";
        });
        return;
      }
    }
    update((s) => {
      if (result.ok) {
        s.error = null;
        s.tab = "versions";
        s.lastPublished = result.data.version; // a new key remounts the panel, which loads the list again
      } else failed(result.problem, problemMessage(result.problem))(s);
    });
    // the page's props (canIssue: "ออกเอกสาร" needs a published version) come from the server: read them again
    if (result.ok) router.refresh();
  }

  // the draft as the editor holds it now, saved or not
  const typed = (): Snapshot => ({
    files: state.files.map((f) => ({ name: f.name, content: editor.current?.content(f.name) ?? f.content })),
    assets: state.assets,
  });

  const reset = (version: number) =>
    exclusive(async () => {
      const result = await resetDraft(state.templateId, version, state.revision);
      const draft = result.ok ? await loadDraft(state.templateId) : result;
      update(draft.ok ? reloaded(draft.data) : failed(draft.problem, problemMessage(draft.problem)));
      return draft.ok;
    });

  // the Problems tab follows the saved draft: opening it and every new revision (save, add, delete, reset)
  // check again; an answer for a revision already replaced is dropped
  useEffect(() => {
    if (state.conflict || archived || issue) return; // archived: the api answers 410; issue mode: no draft view
    let current = true;
    validateDraft(state.templateId).then((result) => {
      if (current) update(result.ok ? validated(result.data) : failed(result.problem, problemMessage(result.problem)));
    });
    return () => {
      current = false;
    };
  }, [state.templateId, state.revision, state.conflict, archived, issue, update]);

  /** Params from the box, or the box's error shown in the bar. */
  function params(): Record<string, unknown> | null {
    const parsed = parseParams(state.paramsText);
    if ("params" in parsed) return parsed.params;
    update((s) => {
      s.error = parsed.error;
    });
    return null;
  }

  async function prepare() {
    if (!params() || !(await saveAll())) return;
    update((s) => {
      s.tab = "prepared";
    });
    const result = await prepareDraft(state.templateId, params()!);
    update((s) => {
      if (result.ok) {
        s.prepared = result.data;
        s.error = null;
      } else failed(result.problem, problemMessage(result.problem))(s);
    });
  }

  /** The form posts into the iframe; the Route Handler answers with the PDF (or a Thai error page). */
  async function preview() {
    if (!params() || !(await saveAll())) return;
    setPreviewed(true);
    previewForm.current?.requestSubmit();
  }

  async function refreshRun() {
    const result = await latestRun(state.templateId);
    if (result.ok)
      update((s) => {
        s.run = result.data;
      });
  }

  function pick(file: string, line: number, column?: number) {
    update((s) => {
      s.active = file;
    });
    editor.current?.goto(file, line, column);
  }

  const addFile = (file: string, content = "") =>
    exclusive(async () => {
      const result = await saveFile(state.templateId, file, content, state.revision);
      update(
        result.ok ? fileAdded(file, result.data.revision, content) : failed(result.problem, problemMessage(result.problem)),
      );
      return result.ok;
    });

  const removeFile = (file: string) =>
    exclusive(async () => {
      const result = await deleteFile(state.templateId, file, state.revision);
      update(result.ok ? fileRemoved(file, result.data.revision) : failed(result.problem, problemMessage(result.problem)));
      return result.ok;
    });

  const upload = (file: File) =>
    exclusive(async () => {
      const form = new FormData();
      form.set("file", file);
      form.set("revision", String(state.revision));
      const response = await fetch(`/assets/${state.templateId}`, { method: "POST", body: form });
      if (response.status === 401) {
        router.push("/login"); // the session ended
        return false;
      }
      const body = await response.json();
      if (response.ok) update(assetAdded((body as { asset: Asset }).asset, (body as { revision: number }).revision));
      else update(failed(body as Problem, problemMessage(body as Problem)));
      return response.ok;
    });

  const removeAsset = (asset: string) =>
    exclusive(async () => {
      const result = await deleteAsset(state.templateId, asset, state.revision);
      update(result.ok ? assetRemoved(asset, result.data.revision) : failed(result.problem, problemMessage(result.problem)));
      return result.ok;
    });

  async function reload() {
    const result = await loadDraft(state.templateId);
    if (result.ok) update(reloaded(result.data));
    else update(failed(result.problem, problemMessage(result.problem)));
  }

  const unsaved = state.dirty.length > 0;
  const locked = state.saving || state.conflict || archived; // no writes, previews or renders

  /** To the issue mode; unsaved edits would be lost with the code view, so ask first. */
  function toIssue() {
    if (unsaved && !window.confirm(`มี ${state.dirty.length} ไฟล์ที่ยังไม่บันทึก ออกจากหน้าแก้ code โดยไม่บันทึก?`)) return;
    router.push(`/templates/${state.templateId}?mode=issue`);
  }

  /** To the form builder (v1.6); it reads the saved draft, so unsaved edits would be lost: ask first. */
  function toForm() {
    if (unsaved && !window.confirm(`มี ${state.dirty.length} ไฟล์ที่ยังไม่บันทึก ออกจากหน้าแก้ code โดยไม่บันทึก?`)) return;
    router.push(`/templates/${state.templateId}?mode=form`);
  }

  if (issue) {
    return (
      <div className={styles.workspace}>
        {showDev && <DeveloperDialog body={devBody} onClose={() => setShowDev(false)} />}
        <div className={styles.toolbar}>
          <b>{name}</b>
          <code>{state.templateId}</code>
          <span className={styles.revision}>ออกเอกสาร</span>
          <span className={styles.spacer} />
          <a className={styles.secondary} href={`/documents?template=${state.templateId}`}>
            เอกสารที่ออก
          </a>
          <button type="button" className={styles.secondary} onClick={() => setShowDev(true)}>
            สำหรับนักพัฒนา
          </button>
          <button type="button" className={styles.secondary} onClick={() => router.push(`/templates/${state.templateId}`)}>
            กลับไปแก้ code
          </button>
        </div>
        <div
          ref={main}
          className={styles.issueMain}
          style={{ "--preview-w": `${sizes.preview}px` } as CSSProperties}
        >
          <section className={styles.formPane} aria-label="ฟอร์ม">
            <IssueForm templateId={state.templateId} source={issue} onPdf={setIssued} onBody={setDevBody} />
          </section>
          <Resizer
            orientation="vertical"
            label="ปรับความกว้างช่อง PDF"
            className={styles.issueHandle}
            onMove={(x) => resize((rect, _, pad) => ({ preview: rect.right - x - pad }))}
            onStep={(d) => resize((_, s) => ({ preview: s.preview - d }))}
            onReset={() => resize(() => ({ preview: DEFAULT_SIZES.preview }))}
          />
          <section className={styles.issuePreview} aria-label="PDF">
            <div className={styles.paneTitle}>
              PDF
              <span className={styles.spacer} />
              {issued && (
                <a href={issued.url} download={issued.filename}>
                  ดาวน์โหลด
                </a>
              )}
            </div>
            {issued ? (
              <iframe title="PDF ที่ออก" className={styles.pdf} src={issued.url} />
            ) : (
              <div className={styles.previewEmpty}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a static decoration from public/ */}
                <img src="/jester-mascot.webp" alt="" width={86} height={160} />
                <p>กรอกฟอร์มแล้วกด &quot;ออก PDF&quot;</p>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      {publishing && (
        <DiffDialog
          title="Publish"
          fromLabel={publishedVersion === null ? "published (ยังไม่มี ครั้งนี้จะเป็น v1)" : `published (v${publishedVersion})`}
          toLabel="draft (รวมที่ยังไม่บันทึก)"
          load={publishDiff}
          confirmLabel="Publish"
          requireChanges
          onConfirm={(form) => publish(String(form.get("note") ?? ""))}
          onClose={() => setPublishing(false)}
        >
          <label>
            โน้ตของเวอร์ชันนี้ (เว้นว่างได้)
            <input name="note" maxLength={500} />
          </label>
        </DiffDialog>
      )}
      <div className={styles.toolbar}>
        <b>{name}</b>
        <code>{state.templateId}</code>
        <span className={styles.revision}>draft r{state.revision}</span>
        <span className={styles.spacer} />
        <TemplateMenu templateId={state.templateId} archived={archived} back={`/templates/${state.templateId}`} />
        <span role="status" className={styles.saveState}>
          {state.saving ? "กำลังบันทึก…" : unsaved ? `ยังไม่บันทึก ${state.dirty.length} ไฟล์` : "บันทึกแล้ว"}
        </span>
        <button type="button" className={styles.secondary} onClick={saveAll} disabled={!unsaved || locked}>
          บันทึก (Ctrl+S)
        </button>
        <button type="button" className={styles.secondary} onClick={preview} disabled={locked}>
          Preview
        </button>
        <button type="button" className={styles.publish} onClick={() => setPublishing(true)} disabled={locked}>
          Publish
        </button>
        <button type="button" className={styles.secondary} onClick={toForm} disabled={state.saving}>
          ออกแบบฟอร์ม
        </button>
        <button
          type="button"
          onClick={toIssue}
          disabled={!canIssue}
          title={canIssue ? undefined : archived ? "เลิก archive ก่อนจึงจะออกเอกสารได้" : "publish ก่อนจึงจะออกเอกสารได้"}
        >
          ออกเอกสาร
        </button>
      </div>
      {archived && (
        <div role="status" className={styles.conflict}>
          รายงานนี้ถูก archive แล้ว อ่านได้อย่างเดียว แก้ไข Preview และ Render ไม่ได้จนกว่าจะเลิก archive
          <form action={setArchived.bind(null, state.templateId, false, `/templates/${state.templateId}`)}>
            <button type="submit">เลิก archive</button>
          </form>
        </div>
      )}
      {state.conflict && (
        <div role="alert" className={styles.conflict}>
          มีคนแก้ draft นี้แล้ว การแก้ของคุณยังไม่ถูกบันทึกและไม่ได้เขียนทับของเขา
          <button type="button" onClick={reload}>
            โหลดฉบับล่าสุด (ทิ้งการแก้ที่ยังไม่บันทึก)
          </button>
        </div>
      )}
      {state.error && (
        <div role="alert" className={styles.error}>
          {state.error}
        </div>
      )}
      <div
        ref={main}
        className={styles.main}
        style={
          {
            "--files-w": `${sizes.files}px`,
            "--preview-w": `${sizes.preview}px`,
            "--bottom-h": `${sizes.bottom}px`,
          } as CSSProperties
        }
      >
        <FilePanel
          files={state.files}
          assets={state.assets}
          active={state.active}
          dirty={state.dirty}
          busy={locked}
          onOpen={(file) => {
            setAssetPreview(null);
            update((s) => {
              s.active = file;
            });
          }}
          previewing={assetPreview}
          onPreview={setAssetPreview}
          onAdd={addFile}
          onDelete={removeFile}
          onUpload={upload}
          onDeleteAsset={(asset) => {
            if (asset === assetPreview) setAssetPreview(null);
            removeAsset(asset);
          }}
        />
        <Resizer
          orientation="vertical"
          label="ปรับความกว้างช่องไฟล์"
          className={styles.filesHandle}
          onMove={(x) => resize((rect, _, pad) => ({ files: x - rect.left - pad }))}
          onStep={(d) => resize((_, s) => ({ files: s.files + d }))}
          onReset={() => resize(() => ({ files: DEFAULT_SIZES.files }))}
        />
        <section className={styles.editorPane} aria-label="Editor">
          {assetPreview && (
            <AssetPreview
              key={assetPreview}
              templateId={state.templateId}
              name={assetPreview}
              asset={state.assets.find((a) => a.name === assetPreview)}
              onClose={() => setAssetPreview(null)}
            />
          )}
          <div className={styles.paneTitle} hidden={assetPreview !== null}>
            <code>{state.active}</code>
            {state.dirty.includes(state.active) && <span className={styles.hint}>● ยังไม่บันทึก</span>}
            <span className={styles.spacer} />
            <span className={styles.hint}>Ctrl+S บันทึก</span>
          </div>
          <Editor
            ref={editor}
            files={state.files}
            active={state.active}
            generation={state.generation}
            problems={state.problems}
            onDirty={(file, dirty) => update(setDirty(file, dirty))}
            onSave={saveAll}
            readOnly={archived}
          />
        </section>
        <Resizer
          orientation="vertical"
          label="ปรับความกว้างช่อง preview"
          className={styles.previewHandle}
          onMove={(x) => resize((rect, _, pad) => ({ preview: rect.right - x - pad }))}
          onStep={(d) => resize((_, s) => ({ preview: s.preview - d }))}
          onReset={() => resize(() => ({ preview: DEFAULT_SIZES.preview }))}
        />
        <section className={styles.preview} aria-label="Preview">
          <div className={styles.paneTitle}>PDF Preview</div>
          <form
            ref={previewForm}
            method="post"
            action={`/preview/${state.templateId}`}
            target="pdf-preview"
            className={styles.params}
          >
            <label htmlFor="params">params</label>
            <input
              id="params"
              name="params"
              value={state.paramsText}
              spellCheck={false}
              onChange={(e) => {
                const text = e.target.value;
                update((s) => {
                  s.paramsText = text;
                });
              }}
            />
          </form>
          {!previewed && (
            <div className={styles.previewEmpty}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a static decoration from public/ */}
              <img src="/jester-mascot.webp" alt="" width={86} height={160} />
              <p>คลิก Preview เพื่อ render ตัวอย่าง PDF</p>
            </div>
          )}
          <iframe
            name="pdf-preview"
            title="PDF preview"
            className={styles.pdf}
            onLoad={(e) => {
              // the first load is about:blank; later loads are a preview, which records a run
              let href = "about:blank";
              try {
                href = e.currentTarget.contentWindow?.location.href ?? href;
              } catch {
                href = "pdf"; // the browser's PDF viewer can hide its location; it is a preview all the same
              }
              if (href !== "about:blank") refreshRun();
            }}
          />
        </section>
        <Resizer
          orientation="horizontal"
          label="ปรับความสูงแท็บด้านล่าง"
          className={styles.bottomHandle}
          onMove={(_, y) => resize((rect, _, pad) => ({ bottom: rect.bottom - y - pad }))}
          onStep={(d) => resize((_, s) => ({ bottom: s.bottom - d }))}
          onReset={() => resize(() => ({ bottom: DEFAULT_SIZES.bottom }))}
        />
        <section className={styles.bottom}>
          <div role="tablist" className={styles.tabs}>
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={state.tab === id}
                onClick={() => {
                  update((s) => {
                    s.tab = id;
                  });
                  if (id === "provenance") refreshRun();
                }}
              >
                {label}
                {id === "problems" && state.problems.length > 0 && (
                  <span className={styles.count}>{state.problems.length}</span>
                )}
              </button>
            ))}
            <span className={styles.spacer} />
            {state.tab === "prepared" && (
              <button type="button" onClick={prepare} disabled={locked}>
                คำนวณใหม่
              </button>
            )}
          </div>
          <div role="tabpanel" className={styles.panel}>
            {state.tab === "problems" &&
              (archived ? (
                <p className={styles.hint}>รายงานที่ archive ไม่ถูกตรวจ เลิก archive แล้วจะตรวจให้อีกครั้ง</p>
              ) : (
                <ProblemList problems={state.problems} checked={state.checked} onPick={pick} />
              ))}
            {state.tab === "prepared" &&
              (state.prepared ? (
                <>
                  <JsonTree name="totals" value={state.prepared.totals} />
                  <JsonTree name="params" value={state.prepared.params} />
                  <JsonTree name="lists" value={state.prepared.lists} depth={1} />
                  <JsonTree name="data" value={state.prepared.data} depth={1} />
                </>
              ) : (
                <p className={styles.hint}>กด &quot;คำนวณใหม่&quot; เพื่อดูข้อมูลที่ template จะได้รับ (ใช้ sample data)</p>
              ))}
            {state.tab === "fields" && (
              <FieldsTab read={() => Object.fromEntries(typed().files.map((f) => [f.name, f.content]))} />
            )}
            {state.tab === "provenance" && <RunDetails run={state.run} />}
            {state.tab === "versions" && (
              <VersionsPanel
                key={state.lastPublished ?? 0}
                templateId={state.templateId} busy={locked} onReset={reset} draft={typed} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
