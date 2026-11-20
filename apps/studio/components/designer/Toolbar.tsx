"use client";

import { Ellipsis, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { fitGroups } from "@/lib/toolbar";

import styles from "./Designer.module.css";

// The second row of the designer (SPEC-studio.md v1.9): icon buttons in groups, always there, not following the
// selection. A button that cannot be used is grey; one that is on (bold at the caret, say) is pressed. Groups that do
// not fit the width fold into a "…" button.

export type ToolButton = {
  id: string;
  label: string; // the tooltip and the accessible name, in Thai
  icon: LucideIcon;
  keys?: string; // shown in the tooltip: "Ctrl+B"
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
};
/** A control of its own (a font list, a number box, a colour picker) between the buttons. */
export type ToolNode = { id: string; node: React.ReactNode };
export type ToolGroup = { id: string; label: string; items: (ToolButton | ToolNode)[] };

const isNode = (i: ToolButton | ToolNode): i is ToolNode => "node" in i;
const GAP = 8;

function Group({ group, box }: { group: ToolGroup; box?: (el: HTMLDivElement | null) => void }) {
  return (
    <div ref={box} className={styles.toolGroup} role="group" aria-label={group.label}>
      {group.items.map((item) => {
        if (isNode(item)) return <span key={item.id}>{item.node}</span>;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className={`${styles.toolButton} ${item.pressed ? styles.toolOn : ""}`}
            aria-label={item.label}
            aria-pressed={item.pressed === undefined ? undefined : item.pressed}
            title={item.keys ? `${item.label} (${item.keys})` : item.label}
            disabled={item.disabled}
            // the buttons never take the focus (or the text selection) from what is being typed in
            onMouseDown={(e) => e.preventDefault()}
            onClick={item.onClick}
          >
            <Icon size={16} strokeWidth={1.75} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

export function Toolbar({ groups }: { groups: ToolGroup[] }) {
  const bar = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDivElement>(null);
  const els = useRef<Map<string, HTMLDivElement>>(new Map());
  const widths = useRef<Map<string, number>>(new Map()); // the last width each group had while it was shown
  const [shown, setShown] = useState(groups.length);
  const [open, setOpen] = useState(false);
  const ids = groups.map((g) => g.id).join();

  // every group shown once gives its width; groups that are folded keep the width they had
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const fit = () => {
      for (const [id, box] of els.current) widths.current.set(id, box.offsetWidth);
      const all = groups.map((g) => widths.current.get(g.id) ?? 0);
      const n = fitGroups(all, GAP, el.clientWidth, 34);
      setShown((now) => (now === n ? now : n));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- groups are rebuilt every render; their ids are what matter
  }, [ids, shown]);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => !more.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const folded = groups.slice(shown);
  return (
    <div ref={bar} className={styles.tools} role="toolbar" aria-label="เครื่องมือจัดรูปแบบ">
      {groups.slice(0, shown).map((g) => (
        <Group key={g.id} group={g} box={(el) => (el ? els.current.set(g.id, el) : els.current.delete(g.id))} />
      ))}
      {folded.length > 0 && (
        <div ref={more} className={styles.toolMore}>
          <button type="button" className={styles.toolButton} aria-label="เครื่องมืออื่น" aria-expanded={open} title="เครื่องมืออื่น" onClick={() => setOpen(!open)}>
            <Ellipsis size={16} strokeWidth={1.75} aria-hidden />
          </button>
          {open && (
            <div className={styles.toolPopover}>
              {folded.map((g) => (
                <Group key={g.id} group={g} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
