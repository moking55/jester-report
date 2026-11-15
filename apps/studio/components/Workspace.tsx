"use client";

import { useRef } from "react";
import { useImmer } from "use-immer";

import { loadDraft, saveFile, validateDraft } from "@/lib/actions/draft";
import { problemMessage } from "@/lib/messages";
import { failed, initialState, reloaded, saved, setDirty, validated, type Draft } from "@/lib/workspace";

import { Editor, type EditorHandle } from "./Editor";
import { ProblemList } from "./ProblemList";
import styles from "./Workspace.module.css";

export function Workspace({ draft, name }: { draft: Draft; name: string }) {
  const [state, update] = useImmer(() => initialState(draft));
  const editor = useRef<EditorHandle>(null);

  /** Saves every dirty file in turn; false when one failed (412, 422, …). */
  async function saveAll(): Promise<boolean> {
    if (state.saving || state.conflict) return false;
    update((s) => {
      s.saving = true;
    });
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
    update((s) => {
      s.saving = false;
    });
    return true;
  }

  /** The api validates what is saved, so unsaved edits go first. */
  async function validate() {
    if (!(await saveAll())) return;
    const result = await validateDraft(state.templateId);
    update(result.ok ? validated(result.data) : failed(result.problem, problemMessage(result.problem)));
  }

  function pick(file: string, line: number, column?: number) {
    update((s) => {
      s.active = file;
    });
    editor.current?.goto(file, line, column);
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
        <nav className={styles.files} aria-label="ไฟล์">
          {state.files.map((f) => (
            <button
              key={f.name}
              type="button"
              aria-current={f.name === state.active ? "true" : undefined}
              onClick={() =>
                update((s) => {
                  s.active = f.name;
                })
              }
            >
              {f.name}
              {state.dirty.includes(f.name) && <span aria-label="ยังไม่บันทึก"> ●</span>}
            </button>
          ))}
        </nav>
        <div className={styles.editorColumn}>
          <Editor
            ref={editor}
            files={state.files}
            active={state.active}
            problems={state.problems}
            onDirty={(file, dirty) => update(setDirty(file, dirty))}
            onSave={saveAll}
          />
          <section className={styles.bottom} aria-label="Problems">
            <h2>
              Problems
              {state.problems.length > 0 && <span className={styles.count}>{state.problems.length}</span>}
            </h2>
            <div className={styles.panel}>
              <ProblemList problems={state.problems} checked={state.checked} onPick={pick} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
