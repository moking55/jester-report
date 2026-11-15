// Workspace pane sizes the user drags: the files column, the preview column and the bottom tabs.
// Pure, so the limits are tested without a browser.

export type PaneSizes = { files: number; preview: number; bottom: number };
export type Area = { width: number; height: number };

export const DEFAULT_SIZES: PaneSizes = { files: 210, preview: 420, bottom: 220 };
const MIN = { files: 140, preview: 260, bottom: 100, editor: 280, editorHeight: 140 };

/** Keeps every pane usable: the editor never gets squeezed below its minimum in either direction. */
export function clampSizes(sizes: PaneSizes, area: Area): PaneSizes {
  const files = Math.round(Math.min(Math.max(sizes.files, MIN.files), Math.max(MIN.files, Math.floor(area.width / 3))));
  const preview = Math.round(
    Math.min(Math.max(sizes.preview, MIN.preview), Math.max(MIN.preview, area.width - files - MIN.editor)),
  );
  const bottom = Math.round(
    Math.min(Math.max(sizes.bottom, MIN.bottom), Math.max(MIN.bottom, area.height - MIN.editorHeight)),
  );
  return { files, preview, bottom };
}

/** Saved sizes from storage; anything unreadable falls back to the defaults. */
export function readSizes(text: string | null): PaneSizes {
  try {
    const value = JSON.parse(text ?? "") as Partial<PaneSizes>;
    const pick = (key: keyof PaneSizes) =>
      typeof value[key] === "number" && Number.isFinite(value[key]) ? value[key] : DEFAULT_SIZES[key];
    return { files: pick("files"), preview: pick("preview"), bottom: pick("bottom") };
  } catch {
    return DEFAULT_SIZES;
  }
}
