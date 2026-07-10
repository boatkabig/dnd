# 02 — Module Catalog

รายละเอียดของทุก module ใน `src/lib/` และ `src/lib/engine/`

## หมวดหมู่

### Core Data Layer
- [core-data.md](core-data.md) — `gameData.ts`, `character.ts`, `gameState.ts`
  ข้อมูลพื้นฐาน: classes, races, items, conditions, character state, save snapshot

### Engine Submodules (v2 — pure functions)
- [engine-submodules.md](engine-submodules.md) — `src/lib/engine/` (10 ไฟล์, ~7,000 บรรทัด)
  Character model, combat resolution, magic, effects, movement, action economy, dice
  ⚠️ ส่วนใหญ่ไม่ได้ใช้ใน UI โดยตรง

### Domain Modules (v1 — feature systems)
- [domain-modules.md](domain-modules.md) — 30+ domain modules
  Exploration, world, narrative, encounter, planning, dialogue, content, dungeon, etc.

### Adapter Layer
- [adapters.md](adapters.md) — `engineAdapters.ts`
  สะพานเดียวระหว่าง DnDSolo.tsx กับ domain modules + EventBus singletons

### Content API Layer
- [content-api.md](content-api.md) — `srd.ts`, `open5e.ts`
  SRD/Open5e API clients + normalizers + srdProbe

### Dungeon System (Domain 36 — newest)
- [dungeon.md](dungeon.md) — `dungeon.ts`, `dungeonTables.ts`
  Blueprint, Room, RoomConnection, procedural generator, 5-Room pattern

## Domain Numbering

โมดูลในระบบถูกแบ่งเป็น 36 domains (ตาม architecture document):

| Domain | ชื่อ | ไฟล์ |
|---:|---|---|
| 1-14 | Core (character, items, inventory, equipment, combat, magic, skills, features, resources, conditions, effects, action economy, dice, time) | กระจายหลายไฟล์ |
| 15 | Objects | objects.ts |
| 16-17 | Environment + Terrain | environment.ts, terrain.ts |
| 18 | Vision | vision.ts |
| 19 | Stealth | stealth.ts |
| 20 | Cover | cover.ts |
| 21 | Exploration | exploration.ts |
| 22 | Social | social.ts |
| 23 | Rest | rest.ts |
| 24 | Time | time.ts |
| 25 | Monsters | monsters.ts |
| 26 | World | world.ts |
| 27 | Rule Engine | ruleEngine.ts |
| 28 | Events | events.ts |
| 29 | AoE | aoe.ts |
| 30 | Game State | gameState.ts |
| 31 | Intent Analysis | dialogue.ts (+ /api/intent) |
| 32 | Planning AI | planning.ts |
| 33 | Narrative | narrative.ts |
| 34 | Encounter | encounter.ts |
| 35 | Content | content.ts |
| 36 | Dungeon | dungeon.ts, dungeonTables.ts |

ดู `src/lib/domains.ts` สำหรับ index ที่ครบถ้วน
