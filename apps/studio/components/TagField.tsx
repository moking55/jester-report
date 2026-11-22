"use client";

import { useId, useState } from "react";

import { listTagUse, type TagUse } from "@/lib/actions/tags";
import { addTag, COLOR_NAMES, chipStyle, colorOf, MAX_TAGS, TAG_COLORS, type TagColor } from "@/lib/tags";

import { TagChip } from "./TagChip";

import styles from "./TagField.module.css";

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  typed: string;
  onTyped: (text: string) => void;
  /** Colours by tag name. With `onColor` the chips open a colour choice; without it they are only labels. */
  colors?: Record<string, string>;
  onColor?: (tag: string, color: TagColor) => void;
  label?: string;
};

/** Chips and a box: Enter or a comma adds, Backspace on an empty box removes the last, × removes one.
 *  The names of tags already in use are offered as you type (they are loaded the first time the box is used). */
export function TagField({ value, onChange, typed, onTyped, colors = {}, onColor, label = "tag" }: Props) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [known, setKnown] = useState<TagUse[] | null>(null);

  const load = () => {
    if (known === null) {
      setKnown([]); // asked once; a failure just means no suggestions
      void listTagUse().then(setKnown);
    }
  };

  /** Adds the tags in `texts` one after the other; stops at the first that breaks a rule and says why. */
  function commitAll(texts: string[]): boolean {
    let tags = value;
    for (const text of texts) {
      if (!text.trim()) continue;
      const next = addTag(tags, text);
      if (!next.ok) {
        if (tags !== value) onChange(tags); // the ones before it were fine
        setError(next.error);
        return false;
      }
      tags = next.tags;
    }
    setError(null);
    if (tags !== value) onChange(tags);
    return true;
  }

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
    if (picking === tag) setPicking(null);
    setError(null);
  };

  return (
    <div className={styles.field}>
      <div className={styles.box}>
        {value.map((t) => (
          <TagChip
            key={t}
            tag={t}
            color={colors[t]}
            onRemove={() => remove(t)}
            onPick={onColor ? () => setPicking(picking === t ? null : t) : undefined}
            picked={picking === t}
          />
        ))}
        <input
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          list={`${id}-list`}
          value={typed}
          placeholder={value.length ? "" : "พิมพ์ tag แล้วกด Enter"}
          autoComplete="off"
          onFocus={load}
          onChange={(e) => {
            setError(null);
            // a comma ends a tag: "a,b" typed or pasted becomes two
            const parts = e.target.value.split(",");
            if (parts.length === 1) return onTyped(e.target.value);
            if (commitAll(parts.slice(0, -1))) onTyped(parts.at(-1) ?? "");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // inside a dialog form Enter must not submit it
              if (commitAll([typed])) onTyped("");
            } else if (e.key === "Backspace" && typed === "" && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
        />
        <datalist id={`${id}-list`}>
          {(known ?? [])
            .filter((u) => !value.includes(u.tag))
            .map((u) => (
              <option key={u.tag} value={u.tag} label={`${u.templates + u.documents} รายการ`} />
            ))}
        </datalist>
      </div>
      <div className={styles.count} aria-live="polite">
        {value.length}/{MAX_TAGS}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {onColor && picking && (
        <fieldset className={styles.colors}>
          <legend>สีของ “{picking}” (ใช้กับทุกรายการที่มี tag นี้)</legend>
          {TAG_COLORS.map((c) => (
            <label key={c} className={styles.swatch} style={chipStyle(c)} title={COLOR_NAMES[c]}>
              <input
                type="radio"
                name={`${id}-color`}
                value={c}
                checked={colorOf(colors[picking]) === c}
                onChange={() => onColor(picking, c)}
                aria-label={COLOR_NAMES[c]}
              />
              <span className={styles.dot} />
            </label>
          ))}
          <span className={styles.colorName}>{COLOR_NAMES[colorOf(colors[picking])]}</span>
        </fieldset>
      )}
    </div>
  );
}
