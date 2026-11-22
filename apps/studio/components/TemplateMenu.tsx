"use client";

import { setArchived } from "@/lib/actions/templates";

import { DuplicateDialog } from "./DuplicateDialog";
import { TagEditor } from "./TagEditor";

import styles from "./TemplateMenu.module.css";

/** The ⋯ menu of a template, in the catalog and the workspace toolbar. */
export function TemplateMenu({
  templateId,
  archived,
  back,
  name,
  tags,
  colors,
}: {
  templateId: string;
  archived: boolean;
  name?: string; // shown in the tag dialog's title
  tags?: string[]; // the template's tags: given, the menu offers "แก้ tag…"
  colors?: Record<string, string>; // their colours, for the tag dialog
  back: string; // the page to show again after archive/unarchive
}) {
  return (
    <details className={styles.menu}>
      <summary aria-label={`เมนูของ ${templateId}`}>⋯</summary>
      <div className={styles.items}>
        <a href={`/export/${templateId}`} download>
          Export draft (.zip)
        </a>
        {tags && <TagEditor kind="template" id={templateId} name={name ?? templateId} tags={tags} colors={colors} />}
        <DuplicateDialog templateId={templateId} />
        <form action={setArchived.bind(null, templateId, !archived, back)}>
          <button type="submit">{archived ? "เลิก archive" : "Archive"}</button>
        </form>
      </div>
    </details>
  );
}
