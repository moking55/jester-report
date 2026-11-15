"use client";

import type { ValidationProblem } from "@/lib/workspace";

import styles from "./ProblemList.module.css";

type Props = {
  problems: ValidationProblem[];
  checked: "never" | "valid" | "invalid";
  onPick: (file: string, line: number, column?: number) => void;
};

export function ProblemList({ problems, checked, onPick }: Props) {
  if (problems.length === 0)
    return <p className={styles.empty}>{checked === "valid" ? "ไม่พบปัญหา" : "กำลังตรวจ draft…"}</p>;
  return (
    <ul className={styles.list}>
      {problems.map((p, i) => {
        const where = p.file ? `${p.file}${p.line ? `:${p.line}` : ""}` : p.pointer;
        const text = (
          <>
            <span className={p.severity === "error" ? styles.error : styles.warning}>
              {p.severity === "error" ? "✖" : "▲"}
            </span>
            <code>{p.code}</code>
            <span className={styles.message}>{p.message}</span>
            {where && <span className={styles.where}>{where}</span>}
          </>
        );
        return (
          <li key={i}>
            {p.file && p.line ? (
              <button type="button" onClick={() => onPick(p.file!, p.line!, p.column)}>
                {text}
              </button>
            ) : (
              <div>{text}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
