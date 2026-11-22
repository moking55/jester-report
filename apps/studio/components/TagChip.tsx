import { chipStyle } from "@/lib/tags";

import styles from "./TagChip.module.css";

type Props = {
  tag: string;
  color?: string;
  /** Set: the name is a button (opens the colour choices); `picked` marks the one that is open. */
  onPick?: () => void;
  picked?: boolean;
  /** Set: a × button that removes the tag. */
  onRemove?: () => void;
};

/** A tag as a coloured chip; plain text on its own, with buttons when the dialog passes handlers. */
export function TagChip({ tag, color, onPick, picked, onRemove }: Props) {
  return (
    <span className={`${styles.chip} ${picked ? styles.picked : ""}`} style={chipStyle(color)}>
      {onPick ? (
        <button type="button" className={styles.name} onClick={onPick} aria-expanded={picked} aria-label={`สีของ ${tag}`}>
          {tag}
        </button>
      ) : (
        <span className={styles.name}>{tag}</span>
      )}
      {onRemove && (
        <button type="button" className={styles.remove} onClick={onRemove} aria-label={`ลบ tag ${tag}`}>
          ×
        </button>
      )}
    </span>
  );
}

/** The chips of one item, in the order they were given. */
export function TagChips({ tags, colors, className }: { tags: readonly string[]; colors: Record<string, string>; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <span className={className} style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {tags.map((t) => (
        <TagChip key={t} tag={t} color={colors[t]} />
      ))}
    </span>
  );
}
