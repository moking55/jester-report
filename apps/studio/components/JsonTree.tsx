import styles from "./JsonTree.module.css";

/** A read-only tree of JSON; the first two levels start open. */
export function JsonTree({ name, value, depth = 0 }: { name: string; value: unknown; depth?: number }) {
  if (value === null || typeof value !== "object") {
    return (
      <div className={styles.leaf}>
        <span className={styles.key}>{name}</span>
        <span className={typeof value === "string" ? styles.string : styles.other}>{JSON.stringify(value)}</span>
      </div>
    );
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
  return (
    <details open={depth < 2} className={styles.node}>
      <summary>
        <span className={styles.key}>{name}</span>
        <span className={styles.other}>{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </summary>
      {entries.map(([k, v]) => (
        <JsonTree key={k} name={k} value={v} depth={depth + 1} />
      ))}
    </details>
  );
}
