/** Date and time in Thai, Bangkok time (the team's clock, whatever the server's). */
export const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" })
    : "–";
