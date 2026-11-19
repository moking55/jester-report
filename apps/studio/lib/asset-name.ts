// Asset names and types in one place (SPEC-studio.md v1.7 รอบแก้ข้อ 9). The api keeps a strict name rule
// (template_store/limits.py ASSET_FILE): ASCII letters, digits, ".", "_", "-". Studio turns whatever the person's
// file is called into such a name before uploading, so any file name works and no `src` needs escaping.

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp"] as const;
export const FONT_EXTENSIONS = ["ttf", "otf"] as const;

/** The api's rule for an asset name (keep in step with ASSET_FILE). */
export const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(png|jpe?g|gif|svg|webp|avif|bmp|ttf|otf)$/;

/** For <input type="file" accept>: images only, or images and fonts. */
export const IMAGE_ACCEPT = IMAGE_EXTENSIONS.map((e) => `.${e}`).join(",");
export const ASSET_ACCEPT = [...IMAGE_EXTENSIONS, ...FONT_EXTENSIONS].map((e) => `.${e}`).join(",");

const extensionOf = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "");

export const isImageName = (name: string) => (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(name));
export const isAssetName = (name: string) => isImageName(name) || (FONT_EXTENSIONS as readonly string[]).includes(extensionOf(name));

/**
 * A name the api accepts for an uploaded file: spaces and anything outside A–Z, 0–9, ".", "_", "-" (Thai too) become
 * "-", the extension is lower case, nothing left → "image"/"font", a name already taken gets "-2", "-3", …
 * null when the file is not an image or font type the api takes.
 */
export function safeAssetName(name: string, taken: readonly string[]): string | null {
  const ext = extensionOf(name);
  if (!isAssetName(name)) return null;
  const fallback = (FONT_EXTENSIONS as readonly string[]).includes(ext) ? "font" : "image";
  let base = name
    .slice(0, name.length - ext.length - 1)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // é → e
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[-._]+$/, "");
  if (!base) base = fallback;
  const used = new Set(taken.map((t) => t.toLowerCase()));
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate = `${base.slice(0, 100 - suffix.length)}${suffix}.${ext}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
