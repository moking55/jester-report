// The designer's toolbar (SPEC-studio.md v1.9): which of its groups fit in the width it has; the rest fold into "…".

/** How many of the groups (their widths, in px, in order) fit in `available`, leaving room for the "…" button when some do not. */
export function fitGroups(widths: number[], gap: number, available: number, moreWidth: number): number {
  const total = (n: number) => widths.slice(0, n).reduce((sum, w) => sum + w, 0) + gap * Math.max(0, n - 1);
  if (total(widths.length) <= available) return widths.length;
  let n = widths.length - 1;
  while (n > 0 && total(n) + gap + moreWidth > available) n--;
  return n;
}
