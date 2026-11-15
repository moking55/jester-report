"use client";

import styles from "./Resizer.module.css";

type Props = {
  orientation: "vertical" | "horizontal"; // vertical: a bar between columns
  label: string;
  className?: string;
  onMove: (clientX: number, clientY: number) => void;
  onStep: (delta: number) => void; // arrow keys: + is right or down
  onReset: () => void;
};

/** A drag handle between panes. Pointer capture keeps the drag going over the PDF iframe;
 *  arrow keys (Shift for bigger steps) do the same for keyboard users; double-click resets. */
export function Resizer({ orientation, label, className, onMove, onStep, onReset }: Props) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      title={`${label} (ลาก, ลูกศร, ดับเบิลคลิกเพื่อคืนค่า)`}
      tabIndex={0}
      className={`${styles.resizer} ${styles[orientation]} ${className ?? ""}`}
      onPointerDown={(e) => {
        e.preventDefault(); // no text selection while dragging
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onMove(e.clientX, e.clientY);
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        const delta = { ArrowLeft: -step, ArrowUp: -step, ArrowRight: step, ArrowDown: step }[e.key];
        if (delta === undefined) return;
        e.preventDefault();
        onStep(delta);
      }}
    />
  );
}
