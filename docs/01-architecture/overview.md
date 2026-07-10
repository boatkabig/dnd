# 01 — Architecture Overview

## 1. ภาพรวมระบบ

โปรเจกต์นี้เป็น **D&D 5e Solo Engine** — ผู้เล่นคนเดียวเล่นกับ AI DM
โครงสร้างหลักมี 4 layer:

```
┌─────────────────────────────────────────────────────────┐
│  UI Layer  (src/components/DnDSolo.tsx — 5,645 บรรทัด)  │
│  • React component เดียว (god component)                 │
│  • จัดการ state ทั้งหมด + render UI + combat logic inline │
└────────────────────┬────────────────────────────────────┘
                     │ ใช้ผ่าน engineAdapters.ts
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Adapter Layer  (src/lib/engineAdapters.ts — 926 บรรทัด) │
│  • สะพานระหว่าง UI กับ domain modules                    │
│  • emit* functions (17 ตัว) สำหรับ EventBus              │
│  • getRuleRegistry(), getEventBus() singletons           │
│  • legacy save/load migration                            │
└────────────────────┬────────────────────────────────────┘
                     │ delegate ไป
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Domain Modules  (src/lib/*.ts — 45 ไฟล์, ~16,000 บรรทัด)│
│  • gameData.ts (962) — core constants + helpers          │
│  • events.ts (442) — EventBus + 30+ event types          │
│  • ruleEngine.ts (423) — RuleRegistry                    │
│  • rollResolver.ts (277) — D20 resolution                │
│  • 30+ domain modules (exploration, world, narrative...) │
└────────────────────┬────────────────────────────────────┘
                     │ บางส่วน delegate ต่อ
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Engine Submodules  (src/lib/engine/*.ts — 10 ไฟล์, ~7,000)│
│  • character.ts (946) — Character data model             │
│  • combat.ts (817) — resolveAttack, applyDamage          │
│  • magic.ts (878) — spell resolution                     │
│  • effects.ts (865) — conditions + buffs                 │
│  • movement.ts (683) — grid movement + opp attacks       │
│  • actionEconomy.ts (581) — Action/Bonus/Reaction        │
│  • ฯลฯ                                                   │
└─────────────────────────────────────────────────────────┘
```

## 2. AI / Engine Boundary

หลักการสำคัญ: **LLM ห้ามตัดสินกฎ, Engine ห้าม narrate**

| ความรับผิดชอบ | LLM (DM) | Engine |
|---|---|---|
| Intent parsing | ✅ ผ่าน `/api/intent` | ❌ |
| Narration | ✅ บรรยายฉาก | ❌ |
| NPC dialogue | ✅ เล่นเป็น NPC | ❌ |
| ตัดสินผลเต๋า | ❌ ห้าม | ✅ |
| คำนวณดาเมจ/HP | ❌ ห้าม | ✅ |
| Modifiers/conditions | ❌ ห้าม | ✅ |
| Initiative | ❌ ห้าม | ✅ |
| Legal action validation | ❌ ห้าม | ✅ |

**กฎเหล็กใน DM prompt**:
> "ห้ามตัดสินผลเต๋า ห้ามกำหนดตัวเลขดาเมจ/HP เอง — engine เป็นคนทอยและคำนวณทั้งหมด"

## 3. Data Flow — Player Action

ตัวอย่าง: ผู้เล่นพิมพ์ "โจมตี goblin ด้วย longsword"

```
1. ผู้เล่นพิมพ์ใน DnDSolo.tsx
   ↓
2. submitAction(text) เรียก
   - analyzeIntent(text) → keyword classifier
   - /api/intent → LLM classifier (fallback)
   ↓
3. สร้าง context ส่งให้ DM:
   - [CURRENT SCENE] anchor
   - [STORY CONTEXT] quests, NPC, faction, weather, rest state
   - [status] HP, AC, inventory, slots
   - [AI DM hint] intent + confidence
   - [🏰 DUNGEON CONTEXT] ถ้าอยู่ในดันเจี้ยน
   ↓
4. callDM(buildSystemPrompt(c), history) → POST /api/dm
   - ส่ง system prompt + message history ไป ZAI LLM
   - LLM ตอบเป็น JSON: { narration, requires, start_combat, updates, ... }
   ↓
5. DnDSolo.tsx ประมวลผล JSON response:
   - applyUpdates() → แก้ HP/gold/items/conditions/buffs
   - applyWorldMap() / applyMapUpdate() → แก้ world map
   - applyDungeonUpdates() → แก้ dungeon state
   - ถ้า start_combat → initCombat() (engine roll initiative)
   - ถ้า requires → rollD20() แล้วส่งผลกลับไป DM รอบ 2
   ↓
6. Engine resolve (ในกรณี combat):
   - rollD20() → attack roll vs AC
   - emitAttack/emitHit/emitDamageDealt → EventBus
   - getTriggeredFeatures() → features/feats ทำงานอัตโนมัติ
   - applyDamage() → ลด HP, ตรวจ death saves
   ↓
7. UI update + persist save
```

## 4. Design Principles (ตามที่ implement แล้ว)

### 4.1 Rules are deterministic
- ทุก dice roll ผ่าน `d()` หรือ `rollD20()` ใน DnDSolo.tsx
- engine/dice.ts มี `roll()` function ที่ test ได้
- ⚠️ แต่ยังไม่มี seeded RNG สำหรับ replay (ดู [08-gaps/technical-debt.md](../08-gaps/technical-debt.md))

### 4.2 Narrative generated after state mutation
- DM ตอบ narration หลังจาก engine ทำงานเสร็จ
- ในกรณี combat: engine roll → apply damage → ส่ง summary กลับ DM → DM narrate ผล

### 4.3 No direct HP modification outside engine
- HP แก้ได้ผ่าน `applyUpdates({ hp_delta })` เท่านั้น
- ใน combat: `applyDamage()` ใน engine/combat.ts
- ⚠️ แต่ DnDSolo.tsx ยังมี inline HP modification ในหลายจุด (ดู [08-gaps/technical-debt.md](../08-gaps/technical-debt.md))

### 4.4 Everything produces events
- EventBus.emit() มีในทุก combat action ที่สำคัญ
- 17 emit* functions ใน engineAdapters.ts
- ⚠️ แต่ไม่ใช่ทุก action ใน DnDSolo.tsx emit event (ดู [05-events/event-bus.md](../05-events/event-bus.md))

### 4.5 Every feature subscribes to events
- `registerDefaultListeners()` ใน engineAdapters.ts ลงทะเบียน feature triggers
- queryFeatureTriggers() + getTriggeredFeatures() ใช้หา features ที่ trigger จาก event

## 5. ปัญหาหลักของ architecture ปัจจุบัน

### 5.1 God Component
`DnDSolo.tsx` 5,645 บรรทัด — รวม:
- UI rendering (~2,500 บรรทัด)
- Combat logic inline (~1,000 บรรทัด: initCombat, enemyAttacks, castSRDSpell, playerCombatAction)
- State management (~500 บรรทัด)
- DM response processing (~500 บรรทัด)
- Character creation flow (~500 บรรทัด)
- Modals (sheet, map, dungeon, shop, content, io) (~600 บรรทัด)

### 5.2 engine/ ไม่ได้ใช้เต็มที่
`src/lib/engine/` มี 10 ไฟล์ (~7,000 บรรทัด) แต่ DnDSolo.tsx import ตรง ๆ 0 ครั้ง
ใช้ผ่าน engineAdapters.ts เท่านั้น ซึ่งเป็นสะพานบางส่วน

### 5.3 ไม่มี determinism
- ใช้ `Math.random()` ทั้งหมด ไม่มี seeded RNG
- ไม่มี event log สำหรับ replay
- Save/load ไม่ deterministic (ขึ้นกับเวลาจริง)

ดู [08-gaps/](../08-gaps/) สำหรับรายละเอียด

## 6. อ้างอิง

- [file-inventory.md](file-inventory.md) — รายการไฟล์ทั้งหมด
- [data-flow.md](data-flow.md) — ตัวอย่าง data flow หลายกรณี
- [02-modules/](../02-modules/) — module catalog
- [08-gaps/](../08-gaps/) — ช่องว่าง + technical debt
