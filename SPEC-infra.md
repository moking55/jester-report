# Spec: infra

สถานะ: **อนุมัติแล้ว 18 พ.ย. 2026** · ที่มา: [CAPABILITY_MAP.md](CAPABILITY_MAP.md) หัวข้อ v1.1 ข้อ B3, [docs/ideas/foundations-v1-1.md](docs/ideas/foundations-v1-1.md)

ก่อน v1.1 module นี้มีแค่ [infra/README.md](infra/README.md) และ compose ไม่มี spec ของตัวเอง ไฟล์นี้จึงเริ่มที่หัวข้อ v1.1

## v1.1: B3 backup/restore

### Objective

ผู้ดูแลเซิร์ฟเวอร์ (ชุมชน open source ที่รัน `infra/compose.yaml` บนเครื่องเดียว) ต้องสำรองข้อมูลและกู้คืนได้ด้วยคำสั่งเดียว
ถ้ากู้คืนไม่ได้ "ออกเอกสารจริงได้ทุกวัน" ก็ไม่จริง: ดิสก์เสียครั้งเดียว รายงาน version ที่ publish แล้วหายหมด

ข้อมูลที่ต้องสำรอง (ตรวจจากโค้ด 18 พ.ย. 2026):

| ที่เก็บ | เนื้อหา | ลักษณะ |
| --- | --- | --- |
| PostgreSQL `jester` | รายงาน, draft, version, ผู้ใช้, session, API key (เก็บ hash), runs, themes, `blobs` (รายการ asset) | เปลี่ยนตลอด |
| RustFS bucket `jester-assets` | ไบต์ของ asset ที่ key `assets/<sha256>` | content-addressed, เขียนครั้งเดียว ไม่มีโค้ดลบ |
| `infra/.env` | secrets | **ไม่อยู่ใน backup** ผู้ดูแลเก็บเอง |

PDF ไม่ได้ถูกเก็บ (render แล้วส่งกลับทันที) จึงไม่ต้องสำรอง

### สิ่งที่ส่งมอบ

1. `infra/backup.sh [ปลายทาง]`: สร้างไดเรกทอรี `jester-backup-YYYYMMDD-HHMMSS/` (ค่าเริ่มต้นใต้ `./backups`) ที่มี
   - `db.dump`: `pg_dump -Fc` จาก container `postgres` (snapshot เดียวที่สอดคล้องกัน, ไม่ต้องหยุดระบบ)
   - `blobs.tar`: ไบต์ของทุก sha256 ในตาราง `blobs` ชื่อ entry = sha256
   - `manifest.json`: `formatVersion: 1`, `createdAt`, `lastMigration` (ชื่อล่าสุดใน `schema_migrations`), `blobCount`, sha256 ของ `db.dump` และ `blobs.tar`
2. `infra/restore.sh <ไดเรกทอรี backup>`: กู้คืนเข้า stack ที่ **ฐานข้อมูลว่าง** เท่านั้น
3. CLI ใน api: `python -m jester_api.ops.blobs export|import` อ่าน/เขียน tar ทาง stdout/stdin
   ใช้ `S3BlobStore` และค่า env ที่ container api มีอยู่แล้ว (boto3 มีอยู่แล้ว ไม่เพิ่ม dependency)
4. หัวข้อ "Backup and restore" ใน [infra/README.md](infra/README.md) พร้อมตัวอย่าง cron รายวัน

### ลำดับที่ถูกต้อง (ทำไมไม่เสีย)

- **backup:** dump DB ก่อน แล้วค่อย export blob ตามตาราง `blobs` ณ ตอนนั้น
  store เขียนไบต์ลง S3 ก่อนเขียนแถว DB และไม่เคยลบ blob ดังนั้นชุด blob ที่ export เป็น superset ของที่ dump อ้างถึงเสมอ
- **restore:** ตรวจ sha256 ใน manifest ก่อนแตะอะไร
  → `up -d postgres rustfs` → ตรวจว่า DB ว่าง (ไม่มีตาราง `schema_migrations`) ถ้าไม่ว่างหยุดทันที
  → ตรวจว่า image ของ api รู้จัก `lastMigration` (backup ใหม่กว่า image = หยุด, บอกให้อัปเดต image ก่อน)
  → `pg_restore --single-transaction`
  → `docker compose run --rm --no-deps api python -m jester_api.ops.blobs import < blobs.tar` (สร้าง bucket ถ้ายังไม่มี, `put_if_absent` ตรวจ sha256 ทุกไฟล์)
  → `up -d` ทั้ง stack (api migrate ต่อเองถ้า image ใหม่กว่า backup)
- blob ที่แถว DB มีแต่ S3 ไม่มีตอน export: backup **ล้มเหลว** exit ≠ 0 พร้อมบอก sha256 ไม่สร้าง backup ที่ไม่ครบแบบเงียบ

### Commands

```bash
infra/backup.sh                          # → ./backups/jester-backup-20261118-020000/
infra/restore.sh backups/jester-backup-20261118-020000
COMPOSE_PROJECT_NAME=jester-e2e infra/backup.sh /tmp/bk   # stack อื่น (ใช้ทดสอบ)
cd apps/api && uv run pytest tests/ops -q && uv run ruff check .
shellcheck infra/backup.sh infra/restore.sh
```

สคริปต์เป็น bash รันบนเครื่องที่มี docker (Linux) เรียก `docker compose -f infra/compose.yaml` และเคารพ `COMPOSE_PROJECT_NAME`

### Project Structure

```
infra/backup.sh, infra/restore.sh                       ใหม่
infra/README.md                                         หัวข้อ Backup and restore
apps/api/src/jester_api/ops/__init__.py, blobs.py       ใหม่: CLI export/import
apps/api/tests/ops/test_blobs.py                        ใหม่
```

### Code Style

สคริปต์: `set -euo pipefail`, `umask 077` (backup มี hash รหัสผ่านและข้อมูลรายงาน), ข้อความ error เป็นอังกฤษสั้น ๆ ตาม README
CLI: async แบบเดียวกับ `template_store` ใช้ `tarfile` ของ stdlib

```python
async def export(conn, blobs: BlobStore, out: BinaryIO) -> int:
    """Write every blob listed in the `blobs` table; a missing object fails the backup."""
```

### Testing Strategy

- **unit (`tests/ops/test_blobs.py`, `MemoryBlobStore`):** export แล้ว import ได้ไบต์ครบ, entry ที่ sha256 ไม่ตรงถูกปฏิเสธ,
  object หายตอน export = error, entry ชื่อแปลก (`../x`, ไม่ใช่ hex 64 ตัว) ถูกปฏิเสธ
- **db marker:** export อ่านรายการจากตาราง `blobs` จริง
- **restore drill บน VM (บังคับ, ไม่ใช่ CI):** stack `-p jester-e2e` หลังรัน e2e (มีรายงาน + asset)
  → `backup.sh` → `down -v` → `restore.sh` เข้า project ใหม่ → login ด้วยผู้ใช้เดิม, `GET /v1/templates` เท่าเดิม,
  ดึง asset ได้ sha256 เดิม, render รายงานที่มีรูปได้ 200 → `down -v`
- restore เข้า stack ที่มีข้อมูลแล้วต้องถูกปฏิเสธ (ทดสอบใน drill)

### Boundaries

- **Always:** ตรวจ sha256 ก่อน restore, ปฏิเสธ DB ที่ไม่ว่าง, ไฟล์ backup สิทธิ์ 600
- **Ask first:** เปลี่ยน compose (volume, service), เพิ่ม image/เครื่องมือใหม่ (เช่น rclone, mc)
- **Never:** ใส่ `infra/.env` หรือ secrets ใน backup, restore ทับข้อมูลเดิม, ลบ backup เก่าแทนผู้ดูแล

### Success Criteria

- `backup.sh` บน stack ที่รันอยู่สร้างไฟล์ 3 ไฟล์โดยไม่หยุด service และ exit 0
- restore drill ด้านบนผ่านครบ, บันทึกผลใน `tasks/` พร้อมวันที่
- restore เข้า DB ที่ไม่ว่าง หรือ backup ที่ไฟล์ถูกแก้ = หยุดก่อนแตะข้อมูล, exit ≠ 0
- pytest `tests/ops` ผ่าน, ruff สะอาด, shellcheck สะอาด
- README อธิบาย: สำรองอะไร/ไม่สำรองอะไร, เก็บ `.env` แยก, เข้ารหัสก่อนส่งออกนอกเครื่อง, ตัวอย่าง cron

### Not Doing

- ตั้งเวลาให้อัตโนมัติ / ลบ backup เก่า: ให้ตัวอย่าง cron ใน README แทน
- เข้ารหัส, ส่งขึ้น cloud: แนะนำ `age`/`gpg` ใน README
- point-in-time recovery (WAL), incremental backup: เกินขนาดใช้งานเครื่องเดียว
- restore ทับ stack ที่มีข้อมูล / merge สอง stack
- Windows host: สคริปต์เป็น bash

### Open Questions

- ไม่มี (ตัดสินใจแล้วว่า blob ใช้ CLI ใน api แทนการ tar volume ของ RustFS: volume เป็นรูปแบบภายในของ RustFS ใช้กับ S3 อื่นไม่ได้)
