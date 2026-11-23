import { studioVersion } from "@/lib/version";

/** "Studio 1.14.0 · API 1.14.0": which release is running (login page and the footer's bottom-left). */
export function VersionTag({ api, className }: { api?: string | null; className?: string }) {
  return (
    <span className={className} title="เวอร์ชันของระบบ">
      Studio {studioVersion} · API {api ?? "?"}
    </span>
  );
}
