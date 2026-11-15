"use client";

import { useRef } from "react";
import { useImmer } from "use-immer";

import { loadDraft, saveFile } from "@/lib/actions/draft";
import { problemMessage } from "@/lib/messages";
import { failed, initialState, reloaded, saved, setDirty, type Draft } from "@/lib/workspace";

import { Editor, type EditorHandle } from "./Editor";
import styles from "./Workspace.module.css";

export function Workspace({ draft, name }: { draft: Draft; name: string }) {
  const [state, update] = useImmer(() => initialState(draft));
  const editor = useRef<EditorHandle>(null);

  async function saveAll() {
    if (state.saving || state.conflict) return;
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
        return;
      }
      revision = result.data.revision;
      const stillDirty = editor.current?.markSaved(file, content) ?? false;
      update(saved(file, revision, stillDirty));
    }
    update((s) => {
      s.saving = false;
    });
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
        <Editor
          ref={editor}
          files={state.files}
          active={state.active}
          onDirty={(file, dirty) => update(setDirty(file, dirty))}
          onSave={saveAll}
        />
      </div>
    </div>
  );
}
