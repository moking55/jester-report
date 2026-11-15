"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
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
import { problemMessage } from "@/lib/messages";
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
} from "@/lib/workspace";

import { Editor, type EditorHandle } from "./Editor";
import { FilePanel } from "./FilePanel";
import { JsonTree } from "./JsonTree";
import { ProblemList } from "./ProblemList";
import { RunDetails } from "./RunDetails";
import styles from "./Workspace.module.css";

const TABS = [
  ["problems", "Problems"],
  ["prepared", "Prepared data"],
  ["provenance", "Provenance"],
] as const;

export function Workspace({ draft, name, today }: { draft: Draft; name: string; today: string }) {
  const [state, update] = useImmer(() =>
    initialState(draft, defaultParams(draft.files.find((f) => f.name === "report.json")?.content, today)),
  );
  const editor = useRef<EditorHandle>(null);
  const previewForm = useRef<HTMLFormElement>(null);
  const router = useRouter();

  /** Saves every dirty file in turn; false when one failed (412, 422, …). */
  async function saveAll(): Promise<boolean> {
    if (state.saving || state.conflict) return false;
    update((s) => {
      s.saving = true;
    });
    let revision = state.revision;
    try {
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
      return true;
    } catch {
      // the action itself failed (Studio unreachable, body too big): say so instead of staying "saving"
      update((s) => {
        s.error = "บันทึกไม่สำเร็จ ติดต่อ Studio ไม่ได้ หรือไฟล์ใหญ่เกินไป";
      });
      return false;
    } finally {
      update((s) => {
        s.saving = false;
      });
    }
  }

  /** The api validates what is saved, so unsaved edits go first. */
  async function validate() {
    if (!(await saveAll())) return;
    const result = await validateDraft(state.templateId);
    update(result.ok ? validated(result.data) : failed(result.problem, problemMessage(result.problem)));
  }

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

  async function addFile(file: string) {
    const result = await saveFile(state.templateId, file, "", state.revision);
    update(result.ok ? fileAdded(file, result.data.revision) : failed(result.problem, problemMessage(result.problem)));
  }

  async function removeFile(file: string) {
    const result = await deleteFile(state.templateId, file, state.revision);
    update(result.ok ? fileRemoved(file, result.data.revision) : failed(result.problem, problemMessage(result.problem)));
  }

  async function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    form.set("revision", String(state.revision));
    try {
      const response = await fetch(`/assets/${state.templateId}`, { method: "POST", body: form });
      if (response.status === 401) return router.push("/login"); // the session ended
      const body = await response.json();
      if (response.ok) update(assetAdded((body as { asset: Asset }).asset, (body as { revision: number }).revision));
      else update(failed(body as Problem, problemMessage(body as Problem)));
    } catch {
      update((s) => {
        s.error = "อัปโหลดไม่สำเร็จ ติดต่อ Studio ไม่ได้";
      });
    }
  }

  async function removeAsset(asset: string) {
    const result = await deleteAsset(state.templateId, asset, state.revision);
    update(result.ok ? assetRemoved(asset, result.data.revision) : failed(result.problem, problemMessage(result.problem)));
  }

  async function reload() {
    const result = await loadDraft(state.templateId);
    if (result.ok) update(reloaded(result.data));
    else update(failed(result.problem, problemMessage(result.problem)));
  }

  const unsaved = state.dirty.length > 0;
  return (
    <div className={styles.workspace}>
      <div className={styles.toolbar}>
        <b>{name}</b>
        <code>{state.templateId}</code>
        <span className={styles.revision}>draft r{state.revision}</span>
        <span className={styles.spacer} />
        <span role="status" className={styles.saveState}>
          {state.saving ? "กำลังบันทึก…" : unsaved ? `ยังไม่บันทึก ${state.dirty.length} ไฟล์` : "บันทึกแล้ว"}
        </span>
        <button type="button" onClick={saveAll} disabled={!unsaved || state.saving || state.conflict}>
          บันทึก (Ctrl+S)
        </button>
        <button type="button" onClick={validate} disabled={state.saving || state.conflict}>
          Validate
        </button>
        <button type="button" onClick={preview} disabled={state.saving || state.conflict}>
          Preview
        </button>
      </div>
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
      <div className={styles.main}>
        <FilePanel
          files={state.files}
          assets={state.assets}
          active={state.active}
          dirty={state.dirty}
          busy={state.saving || state.conflict}
          onOpen={(file) =>
            update((s) => {
              s.active = file;
            })
          }
          onAdd={addFile}
          onDelete={removeFile}
          onUpload={upload}
          onDeleteAsset={removeAsset}
        />
        <div className={styles.editorColumn}>
          <Editor
            ref={editor}
            files={state.files}
            active={state.active}
            generation={state.generation}
            problems={state.problems}
            onDirty={(file, dirty) => update(setDirty(file, dirty))}
            onSave={saveAll}
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
                <button type="button" onClick={prepare} disabled={state.saving || state.conflict}>
                  คำนวณใหม่
                </button>
              )}
            </div>
            <div role="tabpanel" className={styles.panel}>
              {state.tab === "problems" && <ProblemList problems={state.problems} checked={state.checked} onPick={pick} />}
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
              {state.tab === "provenance" && <RunDetails run={state.run} />}
            </div>
          </section>
        </div>
        <section className={styles.preview} aria-label="Preview">
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
      </div>
    </div>
  );
}
