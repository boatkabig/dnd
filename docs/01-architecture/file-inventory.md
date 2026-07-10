# 01 — File Inventory

> ข้อมูลจาก `scripts/scan_project.ts` — scan จริงของโค้ด

## สรุป

| กลุ่ม | จำนวนไฟล์ | บรรทัดรวม |
|---|---:|---:|
| src/lib/ (non-engine) | 45 | ~16,000 |
| src/lib/engine/ | 10 | ~7,000 |
| src/components/ (DnDSolo) | 1 | 5,645 |
| src/components/ui/ (shadcn) | ~58 | ~7,000 |
| src/app/ + src/app/api/ | 6 | ~600 |
| src/hooks/ | 3 | ~50 |
| **src/ รวม** | **115** | **~40,000** |
| scripts/ (tests + scanners) | 38 | ~5,300 |

## src/lib/ (Domain Modules — 45 ไฟล์)

| ไฟล์ | บรรทัด | Exports | หน้าที่ |
|---|---:|---:|---|
| open5e.ts | 1,687 | 88 | Open5e v2 API client + normalizers (2024 SRD) |
| srd.ts | 1,295 | 78 | dnd5eapi.co client (2014 SRD fallback) + srdProbe |
| gameData.ts | 962 | 49 | Core constants: classes, races, items, conditions, helpers |
| engineAdapters.ts | 926 | 53 | Bridge: UI ↔ domain modules + EventBus singletons |
| dungeonTables.ts | 903 | 8 | Random tables + procedural dungeon generator |
| combat.ts | 723 | 37 | Legacy combat helpers (used by tests, not UI) |
| features.ts | 642 | 21 | Class features table (Lv.1-20, 12 classes) |
| dungeon.ts | 569 | 26 | DungeonBlueprint, Room, RoomConnection (Domain 36) |
| planning.ts | 566 | 22 | Tactical AI planning (Domain 32) |
| encounter.ts | 558 | 37 | Difficulty calculator + encounter tables (Domain 34) |
| narrative.ts | 526 | 42 | StoryArc, Scene, Pacing (Domain 33) |
| dialogue.ts | 515 | 32 | Dialogue memory + NPC attitude |
| social.ts | 506 | 32 | Social interaction system (Domain 22) |
| content.ts | 505 | 33 | Homebrew content registry (Domain 35) |
| gameState.ts | 495 | 31 | SaveSnapshot + character state migration |
| exploration.ts | 469 | 33 | Travel, search, traps (Domain 21) |
| movement.ts | 468 | 29 | Legacy movement helpers |
| skills.ts | 451 | 24 | Skill system + expertise |
| events.ts | 442 | 17 | EventBus + 30+ event types (Domain 28) |
| time.ts | 434 | 34 | WorldClock + calendar (Domain 24) |
| world.ts | 424 | 37 | MapNode, Location, Quest, Faction (Domain 26) |
| ruleEngine.ts | 423 | 16 | RuleRegistry + COMMON_RULES (Domain 27) |
| conditions.ts | 418 | 24 | 15 conditions definitions |
| monsters.ts | 410 | 36 | Monster data model + AI behavior (Domain 25) |
| effects.ts | 401 | 17 | Spell effects + area shapes |
| diceEngine.ts | 391 | 13 | RollTable + formula parser |
| aoe.ts | 381 | 21 | Area effect calculations (Domain 29) |
| magic.ts | 370 | 38 | Legacy magic helpers |
| resources.ts | 346 | 9 | Resource pools (rage, ki, sorcery, lay on hands) |
| actionSystem.ts | 316 | 9 | Action definitions (legacy) |
| rest.ts | 312 | 20 | Short/Long rest mechanics (Domain 23) |
| rollResolver.ts | 277 | 15 | D20 resolution pipeline |
| cover.ts | 275 | 26 | Position, distance, cover, flanking (Domain 20) |
| domains.ts | 275 | 5 | Domain index + helpers |
| equipment.ts | 275 | 23 | Weapon/armor data (legacy) |
| inventory.ts | 233 | 21 | Inventory + container management |
| objects.ts | 225 | 13 | Scene objects: door, chest, trap, lever (Domain 15) |
| stealth.ts | 218 | 16 | Hide + detection (Domain 19) |
| vision.ts | 212 | 15 | Vision types + light detection (Domain 18) |
| items.ts | 193 | 17 | Item definitions (legacy) |
| environment.ts | 191 | 20 | Weather, light, hazards (Domain 16-17) |
| character.ts | 149 | 4 | Legacy character helpers |
| spells.ts | 140 | 8 | Spell slot tables + helpers |
| terrain.ts | 140 | 13 | Terrain types + movement cost (Domain 17) |
| db.ts | 13 | 1 | Prisma client placeholder |
| utils.ts | 7 | 1 | cn() helper for shadcn |

## src/lib/engine/ (Engine Submodules — 10 ไฟล์, ~7,000 บรรทัด)

| ไฟล์ | บรรทัด | Exports | หน้าที่ | ใช้ใน UI? |
|---|---:|---:|---|:---:|
| character.ts | 946 | 61 | Character data model, ability scores, proficiency | ⚠️ type only |
| magic.ts | 878 | 40 | Spell resolution pipeline | ❌ |
| effects.ts | 865 | 42 | Conditions + buffs application | ❌ |
| combat.ts | 817 | 38 | resolveAttack, applyDamage, death saves | ❌ |
| rest.ts | 726 | 34 | Short/Long rest with recovery rules | ❌ |
| movement.ts | 683 | 35 | Grid movement + opportunity attacks | ❌ |
| skills.ts | 650 | 34 | Skill resolution + expertise | ❌ |
| equipment.ts | 614 | 48 | Weapon/armor with mastery | ⚠️ type only |
| actionEconomy.ts | 581 | 27 | Action/Bonus/Reaction/Legendary tracker | ❌ |
| dice.ts | 542 | 21 | Seeded RNG + dice expressions | ❌ |

⚠️ **engine/ ไม่ได้ใช้โดยตรงใน DnDSolo.tsx** — ดู [08-gaps/unwired-engine.md](../08-gaps/unwired-engine.md)

## src/components/

| ไฟล์ | บรรทัด | หน้าที่ |
|---|---:|---|
| DnDSolo.tsx | 5,645 | God component — UI + state + combat logic + DM orchestration |
| ui/*.tsx (58 ไฟล์) | ~7,000 | shadcn/ui components (button, dialog, sheet, etc.) |

## src/app/api/ (5 routes)

| Route | บรรทัด | หน้าที่ |
|---|---:|---|
| /api/dm | 64 | Proxy to ZAI LLM (chat completions) — DM narration |
| /api/intent | 122 | LLM intent classifier (player input → intent label) |
| /api/open5e | 235 | Open5e v2 proxy (2024 SRD primary) |
| /api/srd | 169 | dnd5eapi.co proxy (2014 SRD fallback) |
| /api | 5 | Health check |

ดู [06-api/routes.md](../06-api/routes.md) สำหรับรายละเอียด

## scripts/ (37 test files + 1 scanner)

| ไฟล์ | บรรทัด | ทดสอบอะไร |
|---|---:|---|
| test_comprehensive.ts | 1,114 | Multi-domain integration test |
| test_roll_system.ts | 338 | Roll resolver |
| test_api_e2e.ts | 269 | API end-to-end |
| test_expertise.ts | 234 | Expertise system |
| test_character_engine.ts | 229 | engine/character.ts |
| test_open5e_api.ts | 225 | Open5e API integration |
| test_dungeon_system.ts | 203 | Domain 36 dungeon blueprint |
| test_equipment_inventory_objects.ts | 167 | Equipment + inventory + objects |
| test_env_terrain_vision_stealth_cover.ts | 160 | Domains 16-20 |
| test_all_domains.ts | 154 | All 30 domains smoke test |
| test_features_resources.ts | 148 | Features + resource pools |
| test_dnd_2024_compliance.ts | 143 | D&D 2024 rules compliance |
| test_srd_full.ts | 142 | SRD adapter comprehensive |
| test_conditions_effects.ts | 128 | Conditions + effects |
| test_dm_prompt_compliance.ts | 127 | DM prompt rule compliance |
| test_combat.ts | 121 | Combat engine |
| test_srd_normalized.ts | 118 | SRD normalization |
| test_eventbus.ts | 117 | EventBus |
| test_full_quality.ts | 109 | Quality regression |
| test_magic.ts | 105 | Magic system |
| scan_project.ts | 102 | Project scanner (used for this doc) |
| (อีก 16 ไฟล์เล็ก ๆ) | ~600 | การทดสอบเฉพาะเรื่อง |

ดู [07-tests/catalog.md](../07-tests/catalog.md) สำหรับรายละเอียด

## สรุป Import Graph — Top 10 โมดูลที่ถูก import มากที่สุด

| จำนวน importer | ไฟล์ |
|---:|---|
| 44 | src/lib/utils.ts (cn() helper — ใช้โดย ui/ ทั้งหมด) |
| 9 | src/lib/gameData.ts (core constants) |
| 6 | src/lib/engine/character.ts (types) |
| 5 | src/lib/diceEngine.ts (rollTable) |
| 4 | src/lib/engine/dice.ts (roll) |
| 3 | src/lib/srd.ts |
| 3 | src/lib/engine/equipment.ts |
| 2 | src/lib/open5e.ts |
| 2 | src/lib/actionSystem.ts |
| 2 | src/lib/conditions.ts |

**สังเกต**: `engineAdapters.ts` ถูก import แค่ 1 ครั้ง (โดย DnDSolo.tsx) — เป็นสะพานเดียวระหว่าง UI กับ engine/

## ไฟล์ที่ไม่ได้ใช้ (อาจเป็น dead code)

จาก import graph — โมดูลที่ไม่มีใคร import (นอกจาก test files):
- `src/lib/combat.ts` (723 บรรทัด) — legacy combat helpers
- `src/lib/movement.ts` (468 บรรทัด) — legacy movement
- `src/lib/magic.ts` (370 บรรทัด) — legacy magic
- `src/lib/equipment.ts` (275 บรรทัด) — legacy equipment
- `src/lib/character.ts` (149 บรรทัด) — legacy character

รวม ~2,000 บรรทัดที่อาจเป็น dead code (มี `engine/` เวอร์ชันใหม่แทน)

ดู [08-gaps/technical-debt.md](../08-gaps/technical-debt.md) สำหรับรายละเอียด
