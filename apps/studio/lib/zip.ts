// Reads jester.json out of a template zip in the browser, so the import dialog can say which report the file
// holds (and ask before replacing a draft) without uploading it first. The api checks the whole zip again.

export type ZipManifest = { id: string; name: string };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The manifest's id and name, or null when the file is not a Jester template zip. */
export async function readManifest(file: Blob): Promise<ZipManifest | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // the end-of-central-directory record is in the last 22 + 65535 (comment) bytes
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count && at + 46 <= bytes.length; n++) {
    if (view.getUint32(at, true) !== CENTRAL) return null;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const skip = nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + skip;
    if (name !== "jester.json") continue;
    if (local + 30 > bytes.length || view.getUint32(local, true) !== LOCAL) return null;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    try {
      const text = new TextDecoder().decode(method === 0 ? raw : await inflateRaw(raw));
      const manifest = JSON.parse(text) as Partial<ZipManifest>;
      return typeof manifest.id === "string" && typeof manifest.name === "string"
        ? { id: manifest.id, name: manifest.name }
        : null;
    } catch {
      return null;
    }
  }
  return null;
}
