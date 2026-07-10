# 01 — Data Flow

เอกสารนี้อธิบายวิธีที่ข้อมูลไหลผ่านระบบใน 4 กรณีหลัก

---

## กรณี 1: Player Action ธรรมดา (ไม่ใช่ combat)

ตัวอย่าง: ผู้เล่นพิมพ์ `"ฉันถามพ่อค้าว่าขายอะไรบ้าง"`

```
┌─────────────────────────────────────────────────────────────────┐
│ DnDSolo.tsx :: submitAction("ฉันถามพ่อค้า...")                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ 1. analyzeIntent(text)  [keyword]      │
         │    → intent="trade", confidence=0.7    │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ 2. POST /api/intent  [LLM classifier]  │
         │    → intent="trade", confidence=0.9     │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ 3. Build context string:               │
         │    [CURRENT SCENE: stonehill_inn]      │
         │    [STORY CONTEXT: quests, NPC, ...]   │
         │    [status: HP, AC, gold, items]       │
         │    [AI DM hint: intent=trade conf=0.9] │
         │    Player: ฉันถามพ่อค้า...               │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ 4. POST /api/dm  →  ZAI LLM            │
         │    system: buildSystemPrompt(c)        │
         │    messages: [...history, newMsg]      │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ 5. LLM ตอบ JSON:                      │
         │    {                                   │
         │      "narration": "พ่อค้ายิ้ม...",       │
         │      "scene": "stonehill_inn",         │
         │      "updates": null                   │
         │    }                                   │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ 6. DnDSolo.tsx ประมวลผล:               │
         │    - entries = [entryNarration(...)]   │
         │    - applyUpdates(null) → no-op        │
         │    - applyWorldMap(null) → no-op       │
         │    - applyMapUpdate(null) → no-op      │
         │    - applyDungeonUpdates(null) → no-op │
         │    - setC, setScene, setLog, setHistory│
         │    - persist() → saveGame()            │
         └───────────────────────────────────────┘
```

---

## กรณี 2: Skill Check (DM สั่ง requires)

ตัวอย่าง: ผู้เล่นพิมพ์ `"ฉันพยายามปีนกำแพง"` → DM สั่ง Athletics check

```
         ┌───────────────────────────────────────┐
         │ LLM ตอบ JSON รอบ 1:                   │
         │    {                                   │
         │      "narration": "กำแพงสูงชัน...",    │
         │      "requires": {                     │
         │        "type": "check",                │
         │        "skill": "athletics",           │
         │        "dc": 13                        │
         │      }                                 │
         │    }                                   │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ DnDSolo.tsx ตรวจพบ res.requires:      │
         │    - rollD20(skillMod(cc,"athletics")) │
         │    - r.total = 15 vs DC 13 → SUCCESS   │
         │    - resultText = "[ผลทอย] athletics   │
         │      check: ทอยได้ 15 vs DC 13 → สำเร็จ"│
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ POST /api/dm รอบ 2 (ต่อ history):      │
         │    messages: [...prev, user:resultText]│
         │    LLM narrate ผล: "คุณปีนขึ้นไปได้..." │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ res2 = {                              │
         │   "narration": "คุณปีนขึ้นไป...",       │
         │   "updates": { "xp_award": 50 }       │
         │ }                                     │
         │ → applyUpdates → gainXP → maybe level │
         └───────────────────────────────────────┘
```

---

## กรณี 3: Combat (start_combat → engine resolve)

ตัวอย่าง: ผู้เล่นพิมพ์ `"โจมตี goblin"` → DM สั่ง start_combat

```
         ┌───────────────────────────────────────┐
         │ LLM ตอบ JSON:                         │
         │    {                                   │
         │      "narration": "goblin ชักดาบ...",  │
         │      "start_combat": {                 │
         │        "monsters": ["goblin","goblin"],│
         │        "surprise": false               │
         │      }                                 │
         │    }                                   │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ DnDSolo.tsx :: initCombat():           │
         │  1. fetchMonsterForCombat("goblin")    │
         │     → SRD/Open5e lookup                │
         │  2. Roll initiative:                   │
         │     - pInit = rollD20(dex mod)         │
         │     - enemyInits = [roll+e.init, ...]  │
         │  3. Build initOrder (sorted desc)      │
         │  4. Build 12x10 battle grid            │
         │  5. Place player + enemies             │
         │  6. rateEncounterDifficulty()          │
         │  7. setCombat(cb)                      │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ ผู้เล่นกด "Attack" ใน UI:               │
         │  playerCombatAction("attack")          │
         │    - rollD20(attackMod) → 18           │
         │    - vs AC 15 → HIT                    │
         │    - emitAttack("player", "goblin_0")  │
         │    - rollFormula("1d8+3") → 7          │
         │    - emitHit("player", "goblin_0",..)  │
         │    - emitDamageDealt(..., 7, "slashing")│
         │    - goblin.hpNow -= 7                 │
         │    - getTriggeredFeatures() →          │
         │      Savage Attacker? Sneak Attack?    │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ Enemy turn: enemyAttacks(cb, cc)       │
         │  for each enemy:                       │
         │    - generateFullPlan() → AI decision  │
         │    - if low HP + high risk → flee      │
         │    - else move toward player + attack  │
         │    - rollD20(enemy.atk) vs player AC   │
         │    - if hit → damage player            │
         │    - concentration check if caster     │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ checkCombatEnd():                      │
         │  if all enemies dead:                  │
         │    - gainXP(cc, totalXP)               │
         │    - handleCombatEndDungeonUpdate()    │
         │    - setCombat(null)                   │
         │    - narrateCombatEvent("ชนะ!")         │
         │      → POST /api/dm → DM narrate ผล    │
         └───────────────────────────────────────┘
```

---

## กรณี 4: Dungeon Enter (Domain 36)

ตัวอย่าง: ผู้เล่นอยู่ที่ world map node `"cave_entrance"` (type=dungeon) พิมพ์ `"เข้าไปดู"`

```
         ┌───────────────────────────────────────┐
         │ DnDSolo.tsx :: submitAction():         │
         │  - currentMapNode = map.nodes[map.current]│
         │  - isAtDungeonEntrance = (type=="dungeon")│
         │  - text matches /เข้า|ใน|สำรวจ/         │
         │  → dungeonHint = "[🏰 DUNGEON ENTER    │
         │    REQUIRED] ..."                      │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ POST /api/dm → LLM เห็น hint:           │
         │  LLM ตอบ JSON:                        │
         │    {                                   │
         │      "narration": "ปากถ้ำมืดมิด...",     │
         │      "dungeon_enter": {                │
         │        "theme": "cave",                │
         │        "id": "spider_cave",            │
         │        "name": "ถ้ำแมงมุมยักษ์",         │
         │        "hook": "แมงมุมยักษ์ออกล่า..."     │
         │      }                                 │
         │    }                                   │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ applyDungeonUpdates(res):              │
         │  → applyDungeonEnter(spec):            │
         │    - spec.theme + spec.id →            │
         │      generateProceduralDungeon(...)    │
         │      → 5-8 rooms (5-Room pattern)      │
         │      → connections, boss, loot         │
         │    - applyDungeonBlueprint(bp):         │
         │      - validateDungeonBlueprint()      │
         │      - createDungeonRunState()         │
         │      - set pendingRoomEncounter        │
         │        (from entrance stagedEncounter) │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │ Auto-trigger pendingRoomEncounter:     │
         │  if (pendingRoomEncounter && !start_combat)│
         │    - initCombat(monsterIds, surprise)  │
         │    - setPendingRoomEncounter(null)     │
         └───────────────────────────────────────┘
```

---

## สถานะที่ persist ลง save

ทุกครั้งที่ `persist()` เรียก → `saveGame()` เก็บ:

```typescript
{
  c: CharacterState,           // HP, abilities, inventory, conditions, buffs, ...
  scene: string,               // current scene label
  log: LogEntry[],             // last 80 entries
  combat: CombatState | null,  // current combat (if any)
  history: DMMessage[],        // last 24 DM exchanges
  map: WorldMap,               // nodes + edges + current
  gameTime: { day, hour },
  quests: Quest[],
  dungeonBlueprint: DungeonBlueprint | null,  // Domain 36
  dungeonRun: DungeonRunState | null,         // Domain 36
}
```

ดู [02-modules/adapters.md](../02-modules/adapters.md) สำหรับรายละเอียด save/load
