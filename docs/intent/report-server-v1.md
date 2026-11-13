# Statement of Intent: Jester Report Server v1

ยืนยันโดยผู้ใช้: 13 พฤศจิกายน 2026 (interview-me)
สถานะ: confirmed intent — ใช้เป็นต้นทางของ capability map และ spec ราย module

| หัวข้อ | ข้อสรุป |
| --- | --- |
| Outcome | Report server โอเพนซอร์ส: ระบบอื่นยิง API ระบุ template + params + ข้อมูล JSON แล้วได้ PDF เอกสารธุรกิจภาษาไทยที่ถูกต้อง โดยใช้ Gotenberg 9.4.1 เป็น engine |
| User | นักพัฒนาไทยในทีมที่ติดตั้ง server เอง (self-host) สร้าง/แก้ template ผ่าน Studio; ระบบของทีมเรียกผ่าน API |
| Why now | เครื่องมือที่มีอยู่จัดการเอกสารภาษาไทยได้ไม่ดี (วรรณยุกต์, ตัดคำ, พ.ศ., บาทตัวอักษร) — เป็นช่องว่างที่แข่งได้ |
| Success | ภายใน 3 เดือนหลังออก v1: คนนอกติดตั้งตาม quickstart แล้วได้ใบเสนอราคา/ใบกำกับภาษีภาษาไทยถูกต้องภายในบ่ายเดียว และมีไม่กี่ทีมใช้จริงจนกลับมาเปิด issue |
| Constraint | ทำ API และ Studio ควบคู่กัน แล้วเติมฟีเจอร์ต่อเนื่อง; Studio v1 สำหรับ developer (login ง่าย + API key); ข้อมูลมาจากผู้เรียกเท่านั้น |
| Out of scope v1 | CLI, data connector (SQL/REST), ลากวางสำหรับฝ่ายธุรกิจ, multi-tenant/RBAC, async job/schedule/email, PDF/A และ digital signature, JRXML, export XLSX/DOCX, page subtotal |

## Stack

- **Backend:** FastAPI (Python) — render API, auth/API key, template store + version (draft/publish), เรียก Gotenberg
- **Frontend (Studio):** Next.js (TypeScript)
  - เน้น Server Components; ดึงข้อมูลจาก FastAPI แบบ server-to-server
  - Client Components เฉพาะส่วนโต้ตอบ (editor, PDF preview, problems, render dialog)
  - Client state: **`useImmer` เท่านั้น** (ส่งต่อผ่าน props/Context ได้; ไม่ใช้ Redux/Zustand/Jotai/React Query/SWR)
  - การเขียนข้อมูลผ่าน Server Actions → FastAPI; FastAPI ไม่เปิดสู่ browser (ไม่ต้อง CORS); session cookie อยู่ที่ Next.js
  - ระบบภายนอกเรียก FastAPI ตรงด้วย API key
- **Deploy:** Docker Compose (ไม่ใช้ Kubernetes) — Next.js + FastAPI + Gotenberg + PostgreSQL + RustFS
- **Storage:** PostgreSQL (เปลี่ยนเป็นของเดิมผ่าน `DATABASE_URL`); asset ใน S3-compatible ค่าเริ่มต้น RustFS
- **Auth:** บัญชีภายใน สิทธิ์เท่ากัน; admin คนแรกผ่านหน้า setup ที่ต้องใช้ one-time setup token จาก log; API key hash/เพิกถอนได้; ไม่มี SSO
- Module และลำดับสร้าง: [CAPABILITY_MAP.md](../../CAPABILITY_MAP.md)

## อ้างอิง

- Research: [REPORT_SYSTEM_FULL_RESEARCH.md](../research/REPORT_SYSTEM_FULL_RESEARCH.md), [proposed decisions](../research/decisions/proposed-decisions.md)
- UI mockup: [design/studio-mvp.html](../../design/studio-mvp.html)
- Intent นี้เปลี่ยน research T29 แนวทาง (ก)/(ค) จาก library+CLI เป็น report server + Studio; effort ของ T29 จึงใช้ไม่ได้ตรง ๆ ต้องประเมินใหม่
