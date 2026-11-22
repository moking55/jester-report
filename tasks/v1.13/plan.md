# แผน v1.13: Jester MCP สำหรับคนทำรายงาน

สถานะ: **รออนุมัติ** · task list: [todo.md](todo.md)
ที่มา: [intent](../../docs/intent/mcp-report-authoring.md), [SPEC-mcp.md](../../SPEC-mcp.md), [SPEC-auth.md](../../SPEC-auth.md) v1.13 (ผู้ใช้ยืนยัน 23 พ.ย. 2026) · ฐาน: `v1.12.0`

## Overview

เพิ่ม service `mcp` (แพ็กเกจใหม่ `apps/mcp`) เป็น remote MCP connector ของ claude.ai: คนทำรายงาน login ด้วยบัญชี Jester ผ่าน OAuth แล้ว AI สร้าง/แก้ draft, validate และดูภาพ preview ได้ ส่วน publish ยังทำใน Studio
ฝั่ง api แก้อย่างเดียวคือ session อายุยาว (migration `0010_long_sessions.sql`); Studio ไม่เปลี่ยน; dependency ใหม่ `mcp`, `pypdfium2` (อยู่ใน `apps/mcp` เท่านั้น)

## Architecture Decisions

- **api ก่อน แล้ว mcp:** session ยาวเป็นสิ่งเดียวที่ `mcp` ต้องการจาก api และเป็นการแก้ contract (R1) จึงทำและผ่าน test ก่อน; `mcp` เรียก api ผ่าน HTTP ตาม contract เท่านั้น
- **OAuth เสี่ยงที่สุด ทำก่อน tool:** ต้องพิสูจน์ว่า auth ของ `mcp` SDK เวอร์ชันที่ pin ทำงานกับ claude.ai (DCR, PKCE, callback) ตั้งแต่ Phase 2 ด้วย tool เดียว (`whoami`) ก่อนลงแรงกับ tool อื่น; ถ้า SDK ไม่พอ หยุดคุยกับผู้ใช้ก่อนเขียน OAuth เอง
- **allow-list อยู่ที่ `api.py` ที่เดียว:** tool ทุกตัวเรียก api ผ่าน client ที่ปฏิเสธ operation นอกรายการ — กันการเพิ่ม tool publish โดยไม่ตั้งใจ (test ตรวจทั้งสองทาง)
- **session ของ Jester อยู่แค่ใน SQLite ของ `mcp`:** claude.ai ได้ token `jmc_` ของ MCP; เก็บ sha256 ของ token เท่านั้น
- **guide มาจาก skill จริง:** `to-jester` ถูก copy ตอน build (script ใน Dockerfile และ dev) ไม่ commit สำเนา; เพิ่มหัวข้อ `mcp` เป็นไฟล์ของ `apps/mcp` เอง
- **ทุก task:** test ก่อนโค้ด, commit ต่อ task (ไม่ commit `AGENTS.md`/`launch.json`), ไม่ push ระหว่างทาง; E2E/live บน stack rc ของเครื่องทดสอบ

## Dependency graph

```
T0 docs ─► T1 auth: session ยาว + 0010 ─► T2 login route + contract ─► Checkpoint A (api)
                                                         │
T3 apps/mcp โครง + api.py ──────────────────────────────┤
   └─► T4 OAuth store/provider ─► T5 หน้า login + whoami ─► T6 token หมดอายุ ─► Checkpoint B (OAuth จริง)
                                                                                   │
        T7 tool อ่าน ─► T8 tool เขียน ─► T9 preview PNG ─► T10 guide ─► Checkpoint C (tool ครบ)
                                                                                   │
                                          T11 Docker + compose ─► T12 live + claude.ai ─► T13 release
```

T3 ทำคู่กับ T1–T2 ได้ (ไม่แตะไฟล์เดียวกัน) แต่ T5 ต้องรอ T2; T7–T10 ทำสลับลำดับได้หลัง Checkpoint B (ลงมือทีละอัน)

## Risks and Mitigations

| ความเสี่ยง | ผล | ทางลด |
| --- | --- | --- |
| auth ของ `mcp` SDK ไม่ครบหรือไม่เข้ากับ claude.ai | สูง | Phase 2 ทำ OAuth + `whoami` ก่อน tool อื่น; Checkpoint B ต่อ claude.ai จริงผ่าน proxy; ไม่ผ่าน → หยุดถามผู้ใช้ |
| session ยาวรั่ว = สิทธิ์เต็ม 90 วัน (ไม่มี role) | สูง | ขอ `long` ได้เฉพาะผู้ถือ studio key; session อยู่ใน SQLite ของ `mcp` เท่านั้น; ลบผู้ใช้/ตั้งรหัสเพิกถอนทันที (test); ถอยกลับ = `DELETE FROM sessions WHERE long_lived` |
| migration 0010 กับฐานจริงของ main stack | กลาง | เพิ่มคอลัมน์ `DEFAULT false` อย่างเดียว; `test_migrations` บนฐานที่มี 0001–0009 + แถวเดิม; โค้ดเก่าไม่อ่านคอลัมน์นี้จึงไม่ต้องย้อน |
| test session เดิมพังเพราะแก้ logic ต่ออายุ | กลาง | ค่าคงที่เดิมไม่เปลี่ยน, เลือกชุดค่าตาม `long_lived`; test เดิมต้องผ่านโดยไม่แก้ |
| login ผ่าน MCP ถูก rate limit รวมกันเพราะ IP เดียว | กลาง | ส่งต่อ IP ด้วย `X-Jester-Client-IP` + studio key; test ทั้งตั้งและไม่ตั้ง header |
| DCR เปิดให้ใครก็ลงทะเบียน client | กลาง | redirect URI ต้องอยู่ใน allow-list; test นอก list → 400 |
| prompt injection จากเนื้อไฟล์ draft | กลาง | ไม่มี tool ทำลายสูง (publish/ผู้ใช้/key ไม่มี); description ของ `get_draft` บอกว่าเป็นข้อมูล; ลบไฟล์มี `destructiveHint` |
| ภาพ preview ใหญ่เกินที่ claude.ai รับ | ต่ำ | สูงสุด 5 หน้า กว้าง 1000 px; ปรับได้ตอน T12 |
| `.claude/skills/to-jester` ไม่อยู่ใน build context ของ Docker | ต่ำ | build context เป็น root ของ repo หรือ script copy ก่อน build — ตัดสินใน T10/T11 แล้วเขียนใน `infra/README.md` |

## Open Questions

- ไม่มีจาก spec (ปิดครบ 23 พ.ย. 2026)
- Checkpoint B ต้องมี DNS `mcp.<โดเมนทีม>` และ route ใน reverse proxy ชี้มาที่เครื่องทดสอบ — ผู้ใช้ต้องตั้งเอง (ผมไม่มีสิทธิ์ใน proxy)
- เลข version: feature → `1.13.0`
