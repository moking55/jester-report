// Thai messages for problems the user can act on. Anything else shows the api's own detail.
import type { Problem } from "./api-core";

const BY_CODE: Record<string, string> = {
  UNAUTHORIZED: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
  RATE_LIMITED: "ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่",
  SETUP_TOKEN_INVALID: "setup token ไม่ถูกต้องหรือถูกใช้ไปแล้ว ดูค่าใหม่ใน log ของ api",
  SETUP_COMPLETED: "ระบบตั้งค่าเสร็จแล้ว กรุณาเข้าสู่ระบบ",
  SERVICE_UNAVAILABLE: "ติดต่อ Jester API ไม่ได้ กรุณาลองใหม่อีกครั้ง",
  PAYLOAD_TOO_LARGE: "ไฟล์ใหญ่เกิน 1 MB",
  DRAFT_INVALID: "draft ยังมีปัญหา แก้ตามรายการแล้วลองใหม่",
  RENDER_TIMEOUT: "สร้าง PDF นานเกินกำหนด",
  INTERNAL_ERROR:"เกิดข้อผิดพลาดที่ server ดูรายละเอียดใน log ของ api",
};

const FIELD: Record<string, string> = {
  username: "ชื่อผู้ใช้ต้องยาว 3–40 ตัว ใช้ได้เฉพาะ a–z, 0–9, . _ -",
  password: "รหัสผ่านต้องยาว 12–200 ตัวอักษร",
  setupToken: "setup token สั้นเกินไป",
  id: "id ต้องยาว 2–63 ตัว ใช้ได้เฉพาะ a–z, 0–9 และ - (ขึ้นต้นด้วยตัวอักษรหรือตัวเลข)",
  name: "ชื่อรายงานต้องยาว 1–120 ตัวอักษร",
};

export function problemMessage(problem: Problem): string {
  if (problem.code === "INPUT_INVALID") {
    const field = problem.problems?.map((p) => p.pointer?.split("/")[1]).find((f) => f && FIELD[f]);
    if (field) return FIELD[field];
  }
  return BY_CODE[problem.code] ?? problem.detail ?? "เกิดข้อผิดพลาด กรุณาลองใหม่";
}
