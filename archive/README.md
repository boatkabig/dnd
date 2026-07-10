# Archive — Dead Code (Phase 5 cleanup)

โฟลเดอร์นี้เก็บโค้ดที่ **ไม่ได้ใช้ใน live path** ของเกม ย้ายมาจาก `src/lib/` และ `src/lib/engine/` ใน Phase 5

## เหตุผลที่ย้าย
Review รอบ 2 (FEATURE_COMPLETENESS_REVIEW.md) พบว่า modules เหล่านี้เป็น dead code — ไม่มี live import ถึง (trace จาก DnDSolo.tsx ไม่ถึง). การเก็บไว้ใน `src/lib/` ทำให้สับสนว่าโค้ดไหนรันจริง.

## โครงสร้าง
- `archive/engine/` — 10 ไฟล์จาก `src/lib/engine/` (Design Doc Ch.01-10, ~7,000 บรรทัด)
- `archive/lib/` — 27 ไฟล์จาก `src/lib/` (domain modules, ~10,000 บรรทัด) + `db.ts`
- `archive/tests/` — 29 test files ที่เทส dead modules (~3,000 บรรทัด)
- `archive/prisma/` — `schema.prisma` (Prisma boilerplate ไม่ได้ใช้, localStorage = by design)

## สถานะ
- **ไม่ลบทิ้ง** — เก็บไว้เป็น reference + อาจ wire กลับในอนาคต
- **ไม่ compile** — ไม่อยู่ใน `src/` แล้ว จึงไม่มีผลต่อ build
- **Tests ไม่รัน** — ย้ายออกจาก `scripts/` แล้ว

## ถ้าต้องการ wire กลับ
1. ย้ายไฟล์กลับไป `src/lib/` หรือ `src/lib/engine/`
2. แก้ imports ใน `engineAdapters.ts` หรือ `DnDSolo.tsx`
3. แทนที่ inline logic ด้วย function จาก module นั้น
4. รัน typecheck + build + tests

ดู `docs/09-roadmap/migration-plan.md` สำหรับแผนการ wire กลับ
