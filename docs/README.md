# D&D 5e Solo Engine — Full Documentation

> **วัตถุประสงค์**: เอกสารชุดนี้สร้างขึ้นเพื่อ Full Review ของโปรเจกต์ทั้งหมด
> อ่านตามลำดับ section หรือกระโดดไปยังส่วนที่สนใจได้โดยตรง

## สถิติโปรเจกต์ (scan ณ วันที่สร้างเอกสาร)

| ตัวเลข | จำนวน |
|---|---|
| Source files (src/) | 115 |
| Script files (scripts/) | 38 |
| Source lines (src/) | ~40,000 |
| Script lines (scripts/) | ~5,300 |
| โมดูลใน src/lib/ | 45 |
| โมดูลใน src/lib/engine/ | 10 |
| API routes | 5 |
| Test files | 37 |

## โครงสร้างเอกสาร

### [01-architecture/](01-architecture/) — ภาพรวมระบบ
- [overview.md](01-architecture/overview.md) — High-level architecture + design principles
- [file-inventory.md](01-architecture/file-inventory.md) — รายการไฟล์ทั้งหมดพร้อมขนาด + จำนวน exports
- [data-flow.md](01-architecture/data-flow.md) — วิธีที่ player action ไหลผ่านระบบ (UI → DM → Engine → UI)

### [02-modules/](02-modules/) — Catalog ของทุก module
- [README.md](02-modules/README.md) — Module index
- [core-data.md](02-modules/core-data.md) — `gameData.ts`, `character.ts`, `gameState.ts`
- [engine-submodules.md](02-modules/engine-submodules.md) — `src/lib/engine/` (10 ไฟล์, ~7,000 บรรทัด)
- [domain-modules.md](02-modules/domain-modules.md) — Domain modules (exploration, world, narrative, etc.)
- [adapters.md](02-modules/adapters.md) — `engineAdapters.ts` (สะพานระหว่าง engine กับ UI)
- [content-api.md](02-modules/content-api.md) — `srd.ts`, `open5e.ts` (SRD/Open5e integration)
- [dungeon.md](02-modules/dungeon.md) — `dungeon.ts` + `dungeonTables.ts` (Domain 36)

### [03-rules/](03-rules/) — การ覆盖กฎ D&D 5e/2024
- [coverage-matrix.md](03-rules/coverage-matrix.md) — Matrix ว่ากฎไหน implement ที่ไหน
- [combat.md](03-rules/combat.md) — Combat system (initiative, attack, damage, death saves)
- [magic.md](03-rules/magic.md) — Spell system (slots, casting, concentration)
- [movement.md](03-rules/movement.md) — Movement, grid, opportunity attacks
- [conditions-effects.md](03-rules/conditions-effects.md) — 15 conditions + buff/debuff system
- [rest-exhaustion.md](03-rules/rest-exhaustion.md) — Short/Long rest, exhaustion (2024 rules)
- [exploration-travel.md](03-rules/exploration-travel.md) — Exploration, travel pace, navigation

### [04-ai-dm/](04-ai-dm/) — การแยก AI กับ Engine
- [boundary.md](04-ai-dm/boundary.md) — หลักการ: LLM ห้ามตัดสินกฎ, engine ห้าม narrate
- [dm-prompt.md](04-ai-dm/dm-prompt.md) — DM prompt structure (buildSystemPrompt)
- [response-contract.md](04-ai-dm/response-contract.md) — JSON response fields DM ส่งกลับ
- [intent-system.md](04-ai-dm/intent-system.md) — Intent analysis (keyword + LLM)

### [05-events/](05-events/) — Event-driven architecture
- [event-bus.md](05-events/event-bus.md) — EventBus class, 30+ event types
- [feature-triggers.md](05-events/feature-triggers.md) — Feature/spell/item listeners

### [06-api/](06-api/) — API routes
- [routes.md](06-api/routes.md) — /api/dm, /api/intent, /api/open5e, /api/srd

### [07-tests/](07-tests/) — Test catalog
- [catalog.md](07-tests/catalog.md) — 37 test files และสิ่งที่ทดสอบ

### [08-gaps/](08-gaps/) — ช่องว่าง + Technical debt
- [missing-rules.md](08-gaps/missing-rules.md) — กฎที่ยังไม่ implement
- [unwired-engine.md](08-gaps/unwired-engine.md) — engine/ modules ที่มีแต่ UI ไม่ได้ใช้
- [technical-debt.md](08-gaps/technical-debt.md) — Technical debt ทั้งหมด

### [09-roadmap/](09-roadmap/) — แผนการพัฒนา
- [migration-plan.md](09-roadmap/migration-plan.md) — Phase A/B/C/D

## วิธีอ่านแนะนำ

1. **อ่าน overview ก่อน** → [01-architecture/overview.md](01-architecture/overview.md)
2. **ดู file inventory** → [01-architecture/file-inventory.md](01-architecture/file-inventory.md)
3. **ดู gaps ก่อน** → [08-gaps/](08-gaps/) — เพื่อเข้าใจปัญหาจริง
4. **ดู roadmap** → [09-roadmap/migration-plan.md](09-roadmap/migration-plan.md) — เพื่อดูแผนแก้

## หมายเหตุ

- ข้อมูลทั้งหมดในเอกสารนี้ generated จาก scan จริงของโค้ด (ใช้ `scripts/scan_project.ts`)
- ตัวเลข line count อาจเปลี่ยนเล็กน้อยหลังจากเขียนเอกสาร
- สำหรับการ review แนะนำให้เปิดไฟล์ source ควบคู่ไปกับเอกสาร
