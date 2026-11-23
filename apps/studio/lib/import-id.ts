// v1.15: a Word file has no manifest, so the import dialog suggests an id and a name from the file name.
import { isTemplateId } from "@/lib/template-id";

/** The file name without .docx, spaces tidied: the report's suggested name. */
export const nameFromFile = (fileName: string) =>
  fileName.replace(/\.docx$/i, "").replace(/\s+/g, " ").trim().slice(0, 120) || "แบบฟอร์ม";

/** kebab-case ASCII from the file name; a Thai-only name gives form-<yyyymmdd> (SPEC-studio v1.15). */
export function idFromFile(fileName: string, today = new Date()): string {
  const ascii = nameFromFile(fileName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 62)
    .replace(/-+$/, "");
  if (isTemplateId(ascii)) return ascii;
  const day = today.toISOString().slice(0, 10).replace(/-/g, "");
  return `form-${day}`;
}

export const isWordFile = (file: File) => /\.docx$/i.test(file.name);
