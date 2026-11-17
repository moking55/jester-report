"use client";

import { setArchived } from "@/lib/actions/templates";

import { DuplicateDialog } from "./DuplicateDialog";

import styles from "./TemplateMenu.module.css";

/** The ⋯ menu of a template, in the catalog and the workspace toolbar. */
export function TemplateMenu({ templateId, archived }: { templateId: string; archived: boolean }) {
  return (
    <details className={styles.menu}>
      <summary aria-label={`เมนูของ ${templateId}`}>⋯</summary>
      <div className={styles.items}>
        <a href={`/export/${templateId}`} download>
          Export draft (.zip)
        </a>
        <DuplicateDialog templateId={templateId} />
        <form action={setArchived.bind(null, templateId, !archived)}>
          <button type="submit">{archived ? "เลิก archive" : "Archive"}</button>
        </form>
      </div>
    </details>
  );
}
