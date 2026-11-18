// The API key form's extra fields, checked before they go to the api (which checks them again).

export type KeyOptions = { expiresAt?: string; templates?: string[]; rateLimitPerMinute?: number };
export type KeyInput = { expires: string; templates: string[]; limit: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `today` is the date in Thailand (YYYY-MM-DD); a key expires at the end of its day, Thai time. */
export function keyOptions(input: KeyInput, today: string): { ok: true; options: KeyOptions } | { ok: false; error: string } {
  const options: KeyOptions = {};
  if (input.expires) {
    const [y, m, d] = today.split("-").map(Number);
    const latest = `${String(y + 5).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!DATE.test(input.expires) || input.expires <= today || input.expires > latest) {
      return { ok: false, error: "วันหมดอายุต้องเป็นวันหลังจากวันนี้ และไม่เกิน 5 ปี" };
    }
    options.expiresAt = `${input.expires}T23:59:59+07:00`;
  }
  if (input.templates.length > 0) options.templates = [...new Set(input.templates)];
  if (input.limit) {
    const limit = Number(input.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
      return { ok: false, error: "จำนวน render ต่อนาทีต้องเป็นจำนวนเต็ม 1–10000" };
    }
    options.rateLimitPerMinute = limit;
  }
  return { ok: true, options };
}
