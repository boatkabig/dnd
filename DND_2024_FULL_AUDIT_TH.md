# รายงานตรวจสอบ DnDSolo เทียบ Dungeons & Dragons 2024 SRD/Basic Rules

> สถานะโค้ดที่ตรวจสอบ: `c20a374` (2026-07-12 15:58 +07:00)  
> วันที่ตรวจสอบ: 2026-07-12  
> ภาษา: ไทย  
> ขอบเขต: D&D 2024 Basic Rules / SRD ที่เข้าถึงได้สาธารณะเท่านั้น ไม่ครอบคลุมตัวเลือกจากหนังสือเสียเงิน, third-party content, setting-specific content หรือ homebrew เว้นแต่ระบุไว้

## บทสรุป

DnDSolo เป็นเกมเล่นคนเดียวที่มี AI DM และมีฐานระบบกติกาที่แข็งแรงกว่าต้นแบบแชต RPG ทั่วไป: มี character creation, combat bridge, dice/action economy, spell slots, rest, effects, monster AI, exploration, shop, oracle, sidekick, Session Zero, campaign memory, schema สำหรับคำตอบ AI และ persistence อยู่จริงในโค้ดและหลายส่วนถูกทดสอบแล้ว

อย่างไรก็ตาม โปรเจกต์ยัง **ไม่ใช่ implementation ที่ครบถ้วนและ authoritative ของ D&D 2024**. สาเหตุหลักคือ state ของเกมและกฎสำคัญบางส่วนมีมากกว่าหนึ่งแหล่ง: engine ที่ typed และทดสอบได้อยู่ข้าง state/branch แบบ legacy ใน `src/components/DnDSolo.tsx`. ดังนั้นการมีฟังก์ชันหรือการทดสอบระดับ engine ไม่ได้แปลว่าเส้นทางผู้เล่นทุกเส้นทางใช้กฎเดียวกัน

**ผลการประเมินโดยรวม:** ระบบเหมาะสำหรับ “D&D-2024-inspired solo adventure” ที่มีกติกาแกนจำนวนมาก แต่ยังต้องปิดช่องว่าง P0/P1 ด้าน death/stability, concentration metadata, exhaustion ruleset และ authoritative state ก่อนอ้างว่าเล่นตาม D&D 2024 ได้ end-to-end.

## ขอบเขต แหล่งอ้างอิง และวิธีอ่านผล

### มาตรฐานที่ใช้

รายงานใช้เฉพาะเอกสารฟรีทางการต่อไปนี้ และสรุปความโดยไม่คัดลอกข้อความกติกาจำนวนมาก

- [D&D Beyond Basic Rules 2024 — สารบัญ](https://www.dndbeyond.com/sources/dnd/br-2024)
- [Playing the Game](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game) — วงจรการเล่น, d20 Tests, social, exploration, combat, damage และ conditions
- [Rules Glossary](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary) — นิยาม action, concentration, conditions, movement, death, rest, hazards และ monster terms
- [Creating a Character](https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character) — class, origin, ability scores, advancement และ multiclassing
- [Spell Descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions) และหมวด Spells ใน Basic Rules — spell characteristics, components, target/range/duration และ ritual
- [System Reference Document 5.2](https://www.dndbeyond.com/resources/1781-systems-reference-document-srd) — ขอบเขตเนื้อหาสาธารณะที่นำไปอ้างอิง/ทำข้อมูลได้

ข้อมูลกติกาอาจมี errata ในอนาคต จึงต้องบันทึกวันที่ตรวจทุกครั้งที่อัปเดตรายงานนี้

### ความหมายของสถานะ

| สถานะ | เกณฑ์ |
|---|---|
| **Implemented** | ผู้เล่นใช้งานผ่าน live UI ได้ และมีหลักฐานทดสอบหรือเส้นทางโค้ดที่เพียงพอสำหรับขอบเขตนั้น |
| **Partial** | มี implementation แต่ขาดกฎสำคัญ, ครอบคลุมเพียงบางตัวเลือก หรือยังไม่เป็น state ที่ authoritative |
| **Model only** | มี type/data/engine แต่ยังไม่ยืนยันว่า live campaign ใช้ข้อมูลนั้นสม่ำเสมอ |
| **Incorrect** | มีพฤติกรรมที่ขัดกับ D&D 2024 หรือมีหลักฐานโค้ดที่แน่นอนว่าผลลัพธ์ผิด |
| **Missing** | ยังไม่พบระบบ runtime ที่เพียงพอ |

> หลักการสำคัญ: **Engine/test support ≠ live UI support.** ตารางต่อไปนี้จะบอกทั้งสองด้านแยกกัน เพื่อไม่ให้การผ่าน unit test ถูกตีความว่าใช้ได้ทุก flow ในเกม

### หลักฐานที่ใช้ในรีโป

- UI หลัก: `src/components/DnDSolo.tsx` และ components ใต้ `src/components/game/`
- กฎ/engine: `src/lib/engine/`, `src/lib/combat.ts`, `src/lib/magic.ts`, `src/lib/effects.ts`, `src/lib/world.ts` และโมดูล domain อื่น
- ข้อมูลกติกา: `src/lib/gameData.ts`, `src/lib/featuresExtended.ts`, `src/lib/subclasses.ts`, `src/lib/open5e.ts`
- เอกสาร audit ก่อนหน้า (ย้ายไป `docs/archive/`): `docs/archive/DND_2024_AUDIT.md`, `docs/archive/DND_2024_SYSTEMS_AUDIT.md`; ใช้เป็นประวัติเท่านั้น โค้ดและ test ปัจจุบันมีลำดับความน่าเชื่อถือสูงกว่า

## ผลการตรวจสอบที่รันในวันที่รายงาน

| คำสั่ง | ผล | สิ่งที่พิสูจน์ | สิ่งที่ไม่พิสูจน์ |
|---|---:|---|---|
| `npm test -- --run` | **28 files / 278 tests passed** | pure engine, bridge, dice, spells, effects, progression, persistence, oracle, sidekick, store และ legacy-script regression ตามที่ test ระบุ | ทุกกฎใน Basic Rules หรือทุกเส้นทาง React/AI DM |
| `npx playwright test` | **12 / 12 passed** | ตัวละครผ่าน wizard 11 ขั้น, combat/target selection, surprise ที่ยังได้เทิร์น, Magic Missile/Fire Bolt, Mage Armor buff, long rest, exploration, shop, oracle และ character sheet | ค่ากติกาทุกรูปแบบ, multiplayer, API LLM จริง, save migration และทุก interaction ของ combat |

Playwright ใช้ route-mocked DM; เป็นการทดสอบ UI จริงแต่ไม่เป็นการตรวจคุณภาพคำตอบของโมเดลหรือ availability ของบริการภายนอก

## Feature-coverage matrix

### 1) Core resolution และ action economy

| ความสามารถตามกติกา | Engine/test | Live UI | สถานะ | หลักฐาน/ช่องว่าง/ความเสี่ยง |
|---|---|---|---|---|
| Ability checks, attack rolls, saving throws และ d20 modifiers | มี `engine/dice.ts`, `engine/skills.ts`, `rollResolver.ts`; มี tests | ใช้ใน combat และ AI flow | Partial | Advantage/disadvantage, proficiency, DC และ dice detail มีพื้นฐาน แต่ยังไม่มี modifier/effect source เดียวสำหรับทุก feature/condition |
| Natural 1/20, critical hit, damage dice | combat/bridge resolver มี | weapon attack live path มี | Partial | หลักการโจมตีพื้นฐานมี; interaction รายละเอียดของทุก spell/feature ต้อง audit เพิ่ม |
| 2024 standard actions: Attack, Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Ready, Search, Study, Utilize | `engine/actionEconomy.ts` มี tracker และ catalog จำนวนมาก | ปุ่ม/flow มีเฉพาะส่วนหนึ่ง | Partial | catalog ยังใช้ชื่อยุคก่อนบางส่วน เช่น `cast_spell`, `use_object`; `Study` และ `Utilize` ไม่ยืนยันว่า live UI dispatch ผ่าน action authority เดียวกัน |
| Action, Bonus Action, Reaction, movement, free interaction | `ActionTracker`, `CombatBridgeState` มี | combat bridge ใช้เป็นส่วนสำคัญ | Partial | มีระบบดีมาก แต่ legacy flags (`movementLeft`, bonus/action fields) ยังอยู่ใน component จึงมีความเสี่ยง state drift |
| Grapple/Shove แบบ 2024 | มี compliance/engine logic | ไม่ครอบคลุมทุก UI flow | Partial | จำเป็นต้องยืนยันว่าทุกเส้นทางใช้ saving-throw approach ของ 2024 ไม่ย้อนกลับไป contested-check แบบ 2014 |

**ข้อกำหนดกติกาที่เกี่ยวข้อง:** d20 Test ครอบคลุม ability check, attack roll และ saving throw; ข้อยกเว้นจาก class/feat/spell/item ชนะกฎทั่วไป. ระบบจึงต้องเก็บ “source ของ modifier” ได้ ไม่ควรกระจายเงื่อนไขไว้ใน UI branches.

### 2) Combat, initiative, movement, damage และ death

| ความสามารถตามกติกา | Engine/test | Live UI | สถานะ | หลักฐาน/ช่องว่าง/ความเสี่ยง |
|---|---|---|---|---|
| Initiative และลำดับเทิร์น | `engine/combat.ts`, `engine/combatBridge.ts` มี turn primitives | `CombatView`/`CombatOverlay` แสดงและขับเคลื่อน combat | Partial | E2E ยืนยัน combat ยังเดินได้ แต่ component ยังเก็บ mirror ของ initiative/current index; ต้องลดเหลือ source เดียว |
| Surprise 2024 = disadvantage ต่อ initiative ไม่ใช่เสียเทิร์น | test E2E โดยตรง | ยืนยันแล้ว | **Implemented (เฉพาะ regression นี้)** | `e2e/dnd-solo.spec.ts` ยืนยันศัตรู surprise ยังทำ enemy turn ใน round 1; ยังควรเพิ่ม deterministic test ที่ตรวจ disadvantage ตอน roll ด้วย |
| การเลือกเป้าหมาย | bridge/attack resolver มี | ยืนยัน E2E ว่าเลือกศัตรูตัวที่สองแล้วโจมตีโดนตัวที่สอง | **Implemented (weapon และ single-target spell ที่ทดสอบ)** | ไม่ได้หมายถึงทุก AoE/secondary target/summon ใช้ target legality ครบ |
| Movement บน grid 5-foot | `engine/movement.ts` และ bridge มี | UI คิดค่า grid step เป็น feet | Partial | แก้ mismatch เดิมที่ speed 30 เคลื่อน 30 ช่องแล้ว; ยังขาด path, terrain, footprint, diagonal/corner, elevation, squeeze และ movement modes |
| Difficult terrain, crawl, climb, swim, fly, burrow, reach/OA | มี utility บางส่วน | ไม่ยืนยัน live integration | Partial / Model only | Rules Glossary กำหนด cost เพิ่มตามวิธีเคลื่อน; ต้องให้ path/terrain API เดียวตอบทั้ง movement, line of sight และ opportunity attack |
| Cover / visibility / targeting | `cover.ts`, `vision.ts`, AoE helpers มี | บาง attack/spell flow ใช้ | Partial | cover +2/+5/total และ clear path ต้องเป็น validator กลาง ไม่ใช่เฉพาะ attack branch |
| Monster AI turns | `engine/enemyAI.ts`, bridge มี tests | E2E เห็น log enemy turn | Partial | AI เลือก turn ได้; full stat-block actions, reactions, recharge และ boss systems ยังไม่ยืนยันว่า live-authoritative |
| Temporary HP, resistance, immunity, vulnerability | utilities/resolvers มี | ใช้บาง flow | Partial | ต้องบังคับลำดับการคำนวณเดียวกันทุกแหล่ง damage |
| 0 HP, Unconscious, death saves | death-save tests และ engine มี | live path มี downed state | **Incorrect / Partial** | `applyDeathSaveRoll` ใน `src/lib/engine/combat.ts` ตั้ง HP เป็น 1 เมื่อ stable; ตาม 2024 stable ยังคง 0 HP และ Unconscious จนได้รับ healing หรือฟื้นตามเวลา |
| Damage at 0 HP, critical damage, massive damage, stabilize/Medicine/Healer’s Kit | บาง primitive มี | ไม่ครบ | Partial | ต้องทดสอบผลของ damage-at-zero, critical=สอง failure, instant death และการ stabilize ทุกช่องทางร่วมกัน |
| Nonlethal knockout | ไม่ยืนยันครบ | ไม่ยืนยัน | Partial | กติกา 2024 ให้ melee attack ลดเป็น 1 HP + Unconscious/Short Rest ได้; ไม่ควรสับสนกับ stable ที่ 0 HP |

**ความเสี่ยงต่อผู้เล่น:** การเดิน, action cost, condition และ HP อาจถูกปรับคนละชุดเมื่อเรียกจาก AI, ปุ่ม combat, trap หรือ event นอก combat. การมี `CombatBridgeState` แล้วแต่ยังมี state คู่ขนานคือความเสี่ยงด้าน correctness ที่ใหญ่ที่สุดของเกม

### 3) Conditions, effects, concentration, rests และเวลา

| ความสามารถตามกติกา | Engine/test | Live UI | สถานะ | หลักฐาน/ช่องว่าง/ความเสี่ยง |
|---|---|---|---|---|
| 15 conditions (Blinded ถึง Unconscious) | IDs/effects/conditions modules มี | แสดง/ใช้บางส่วน | Partial | ต้องสร้าง effect authority ที่มี source, target, duration, stack policy, immunity และ expiry trigger เป็นชุดเดียว |
| Effects/buffs และ duration | `engine/effects.ts`, `effects.ts`, EventBus มี | Mage Armor ยืนยัน E2E | Partial | E2E พิสูจน์ buff ตัวอย่างเดียว; ยังไม่พิสูจน์เงื่อนไข/การหมดอายุ/interaction ของทุก condition |
| Concentration | check/break helpers มี | ใช้ buff list บางเส้นทาง | **Incorrect** | `CONCENTRATION_SPELLS`/name-based lists ใน `engineAdapters.ts` และ `engine/effects.ts` รวม *Spiritual Weapon* ซึ่งไม่ต้อง Concentration; name allowlist ไม่ scale และเสี่ยง false positive/negative |
| Concentration loss from damage/incapacitated/death | helper มี | ไม่ยืนยันครบทุก damage route | Partial | 2024 ใช้ Con save DC 10 หรือครึ่ง damage (สูงสุด 30) และ effect concentration ใหม่แทนเดิม; metadata ต้องเป็น canonical |
| Exhaustion 2024 | `gameData.ts` มีแนวทาง 2024 | การใช้งานมีมากกว่าหนึ่ง module | **Incorrect / conflicting** | กติกา 2024: -2 × level ต่อ d20 Test, speed -5 ft × level, ตายที่ 6, long rest ลด 1. `engine/rest.ts` ยังมี table แบบ 2014 จึงต้องกำจัด/กักกัน |
| Short Rest | `performShortRest`, Hit Die helpers มี | flow พักมี | Partial | ต้องให้ผู้เล่นเลือกใช้ Hit Die ทีละลูกและตัดสินใจต่อ/จบเอง รวมถึง resource recovery ต่อ class |
| Long Rest | `performLongRest`, 16-hour guard, recovery helpers มี | E2E ยืนยัน log restore | Partial | ต้องบังคับ start ที่อย่างน้อย 1 HP, interruption/resume, recovery แบบ atomic และทุก special resource ใน live state |
| Rest interruption | pure helper มี | ไม่ยืนยัน integration | Partial | Initiative, non-cantrip spell, damage และการออกแรงตามเกณฑ์ต้องส่ง event เข้าระบบ rest จริง |
| Campaign time/event scheduling | `time.ts`/adapters มีบางส่วน | ไม่ authoritative ทั่วโลก | Partial / Model only | rest, travel, stable recovery, merchant stock, NPC schedule, quest deadline และ effects ควรใช้ clock/event queue เดียว |

### 4) Spellcasting และ magic

| ความสามารถตามกติกา | Engine/test | Live UI | สถานะ | หลักฐาน/ช่องว่าง/ความเสี่ยง |
|---|---|---|---|---|
| Spell definitions, slots, full/half-caster progression | `engine/magic.ts`, `magic.ts`, `spells.ts` มี | slot UI และ cast flow มี | Partial | E2E ยืนยัน Magic Missile ใช้ slot; ต้อง validate slots/known/prepared class-specific ในทุก level/multiclass |
| Cantrip, spell attack, saving throw, auto-hit | resolver/cast helpers มี | Magic Missile และ Fire Bolt ยืนยัน E2E | Partial | ตัวอย่างไม่เท่ากับ execution ของ spell corpus ทั้งหมด |
| Target selection | cast path มี | Fire Bolt ไปยังศัตรูที่เลือกได้ E2E | **Implemented (single-target flow ที่ทดสอบ)** | ต้องเพิ่ม type/count/self/object/ally/enemy constraints และ retarget rules |
| Range, line of sight, total cover และ valid area | AoE/cover/vision modules มี | ไม่ยืนยันว่าทุก spell เรียก validator เดียว | Partial | spell, feature และ weapon ควรแชร์ spatial query เดียว |
| Areas: cone/line/cube/cylinder/emanation/sphere | `aoe.ts` มี primitives | ไม่ครอบคลุม live ทุก shape | Partial | ต้องเก็บ point of origin, direction, template และ affected targets แบบ deterministic |
| V/S/M components, focus/pouch, free hand, cost/consumed materials | type/data บางส่วน | ไม่ครบ | Partial | Material components ที่มีราคา/ถูก consume ต้องเชื่อมกับ item instances; focus ใช้แทนได้เฉพาะกรณีที่กติกาอนุญาต |
| Casting time, ritual และ reaction spells | engine helper มี | ไม่ครบ | Partial | magic action, multi-turn cast, concentration ระหว่าง cast, ritual +10 นาที และ reaction trigger ต้องเป็น stateful flow |
| Duration, ongoing zones, summons/transformations | effects primitives มี | bespoke หลาย path | Partial | ต้องใช้ data-driven primitives กับ hook เฉพาะตัวเลือก แทน display-name branches |
| Prepared/known spells และ replace schedule | reprepare UI/module มี | รองรับบาง class | Partial | Bard/Sorcerer/Ranger/Warlock, prepared casters, always-prepared spells และ subclass sources ต้อง validate ตาม class/level |

**ข้อควรระวัง:** การ fetch ข้อความ spell จาก SRD/Open5e ช่วยให้แสดงเนื้อหาได้ แต่ไม่เท่ากับระบบ execute ผลของ spell. รายงานจึงไม่ถือว่า “มี data entry” เป็นการรองรับกติกา

### 5) Character creation, origin, advancement และ 12 classes

Character creation live UI มี wizard 11 ขั้น และ E2E ครอบคลุม happy path ถึงเริ่มการผจญภัย. `gameData.ts` มี catalog ของ 12 class ข้างล่าง; `featuresExtended.ts`, `subclasses.ts`, `leveling.ts`, `engine/progression.ts` และ character modules ให้ฐานสำหรับ progression.

| Class 2024 | Catalog/creation | Features/resources live | สถานะ | ช่องว่างหลักที่ต้องตรวจเป็นราย class |
|---|---|---|---|---|
| Barbarian | มี | Rage/บาง feature มีปุ่ม | Partial | resource progression, weapon mastery, subclass และทุก level 1–20 |
| Bard | มี | Bardic Inspiration/เวทบางส่วน | Partial | prepared/known schedule, expertise, magical secrets และ subclass execution |
| Cleric | มี | spell/Channel-style feature บางส่วน | Partial | domain choices, Channel Divinity, prepared list และ resource recovery |
| Druid | มี | spell/Wild Shape foundations | Partial | beast forms, templates, subclass และ forms ที่เปลี่ยน stat/space |
| Fighter | มี | Second Wind/Action Surge | Partial | Fighting Style, Weapon Mastery, Extra Attack, Indomitable และ subclass maneuvers |
| Monk | มี | martial arts/Flurry-style UI | Partial | Focus Points, Discipline features, movement และ subclass effects |
| Paladin | มี | Lay on Hands/Divine Smite paths | Partial | channel features, spell preparation, aura และ oath behavior |
| Ranger | มี | spell/subclass data | Partial | Favored Enemy, weapon mastery, companion/hunter features และ prepared schedule |
| Rogue | มี | Sneak Attack/Hide paths | Partial | Cunning Action, Expertise, Reliable Talent, subclasses และ reaction timing |
| Sorcerer | มี | spell slots/sorcery data | Partial | Sorcery Points, Metamagic, conversion และ subclass resources |
| Warlock | มี | Pact Magic short-rest logic | Partial | invocations, pact slots, Mystic Arcanum และ subclass behavior |
| Wizard | มี | spellbook/reprepare/cast flow | Partial | spellbook acquisition, preparation cap, rituals, recovery และ subclass behavior |

| ความสามารถตามกติกา | Engine/test | Live UI | สถานะ | หลักฐาน/ช่องว่าง/ความเสี่ยง |
|---|---|---|---|---|
| Background + species + languages + ability scores + origin feat | data/creation logic มี | wizard มี | Partial | 2024 ให้ background เป็นเจ้าของ ASI/Origin Feat/skills/tool/equipment choice; ต้อง normalize one canonical character build |
| Starting equipment/currency | data/shop/inventory มี | creation/shop มี | Partial | package choice, 50 GP alternative, trinket และ currency accounting ต้องไม่หลุดจาก live inventory |
| Feats, ability score improvement และ Epic Boon | catalog/leveling บางส่วน | modal/UI มีบางส่วน | Partial | prerequisite, choice validation และ level-19 handling ต้องเป็น build validator |
| Level advancement และ XP | progression/leveling tests มี | ใช้งานบาง flow | Partial | ทุก class feature, HP/slot/resource updates และ save migration ต้อง atomic |
| Multiclassing | character/progression support บางส่วน | ไม่ยืนยันครบ | Partial | ability prerequisite, partial proficiencies, total-level PB, spell slot progression, feature conflicts และ save migration |
| Species traits, size และ speed | data มี | creation/character มี | Partial | size/space/speed ต้อง propagate เข้าสู่ combat, movement, carry และ world interactions |

### 6) Equipment, inventory, economy และ magic items

| ความสามารถตามกติกา | Engine/test | Live UI | สถานะ | หลักฐาน/ช่องว่าง/ความเสี่ยง |
|---|---|---|---|---|
| Weapons, armor, shields และ attacks | catalogs/resolvers มี | character/combat UI มี | Partial | ต้องผูก equipped/wielded slots, hands, armor training, AC calculation และ weapon properties กับ item instance |
| Ammunition, loading, versatile, two-handed, thrown, finesse, mastery | data บางส่วน | ไม่ครบ | Partial | quantity/recovery/consumption และ interaction กับ hands/action flow ยังไม่เป็น source เดียว |
| Inventory/carrying/container | `engine/equipment.ts`, inventory modules มี | live inventory มีรูปแบบ legacy | Partial / Model split | ต้องมี `ItemInstance` ID, quantity, owner/container, charges, attunement, weight และ audit trail |
| Currency and buy transaction | economy tests มี | shop E2E ลด GP ได้ | **Implemented (buy decrement ที่ทดสอบ)** | ยังไม่ใช่ merchant state; transaction/stock/sell prices ต้อง atomic และ persisted |
| Merchant stock, services, availability, buyback | world/economy models มี | shop เป็น catalog-oriented | Partial / Model only | merchant identity/location/faction, restock, demand, ledger และ stolen goods ยังไม่ live-authoritative |
| Magic items, charges, attunement, identification, curse/sentience | data/types บางส่วน | ไม่ครบ | Partial | กติกา lifecycle ไม่ควรแทนด้วยชื่อ item ใน array |
| Tools, mounts, vehicles, trade goods และ crafting | data บางส่วน | ไม่ครบ | Partial | ต้องนิยาม action/requirement/time/material/output และ world-state consequence |

### 7) Monsters, encounters และ DM authority

| ความสามารถตามกติกา | Engine/test | Live UI | สถานะ | หลักฐาน/ช่องว่าง/ความเสี่ยง |
|---|---|---|---|---|
| Monster data/import | `open5e.ts`, `monsters.ts`, bestiary มี | ใช้ spawn combat ได้ | Partial | external catalog ต้อง normalize license/version/source และ map เข้าสู่ runtime stat block |
| Basic enemy turn/attacks | `engine/enemyAI.ts`, combat bridge มี | E2E ยืนยัน enemy turn log | Partial | full action choices และ legal positioning/targets ยังต้อง enforce ด้วย same combat state |
| Multiattack | parser/helpers มี | ไม่ยืนยันทุก stat block | Partial | natural-language parsing ไม่ควรเป็น authoritative execution ของ monster action |
| Recharge, limited use, Legendary Resistance/Actions, Lair/Mythic actions | action economy types มี | ไม่ยืนยัน live integration | Model only / Partial | ต้องเก็บ resource/recharge/initiative rule per creature instance |
| Senses, stealth, reach, size, creature type, resistance/immunity | models มีบางส่วน | ไม่ครบ | Partial | ต้อง feed visibility/targeting/combat, ไม่ใช่แค่แสดง stat |
| Encounter difficulty/rewards | encounter modules/tests มี | ใช้บาง flow | Partial | solo modifier, CR data, XP/treasure/morale/surrender/nonlethal outcomes ต้อง connect กับ campaign state |
| AI DM output validation | `dmSchema.ts`, `dmContext.ts`, routes/adapters มี | API path ใช้ structured response | Partial | AI ต้องเสนอ narrative/intent เท่านั้น; engine ต้องเป็นผู้ตัดสิน HP, dice, DC, targets, economy และ world changes |

### 8) Social, exploration, dungeon, world และ quests

| ความสามารถตามกติกา | Engine/test | Live UI | สถานะ | หลักฐาน/ช่องว่าง/ความเสี่ยง |
|---|---|---|---|---|
| Social interaction / Influence / attitude | `social.ts`, `dialogue.ts` มี | DM/chat flow มี | Partial | attitude มีพื้นฐาน แต่ goals, leverage, 24-hour retry rule, evidence, consequence และ NPC memory/location ยังไม่รวมเป็น state เดียว |
| Oracle สำหรับ solo play | `engine/oracle.ts` มี tests | modal ยืนยัน E2E | **Implemented** | เป็น solo aid ของโปรเจกต์ ไม่ใช่กติกาหลัก D&D จึงไม่ควรปะปนกับ rules adjudication |
| Exploration turn, weather, events | exploration modules มี tests | 1-hour exploration flow ยืนยัน E2E | Partial | pace, marching order, navigation, foraging, food/water, encounter scheduling, visibility และ hazards ยังไม่เป็น procedure ต่อเนื่อง |
| Food/water/dehydration/malnutrition | มี data/hazard concepts บางส่วน | ไม่ยืนยัน live | Partial / Model only | Basic Rules เชื่อม resource เหล่านี้กับ Exhaustion จึงต้องใช้ time/inventory system เดียว |
| Dungeon blueprint / rooms | `dungeon.ts`, `DungeonView` มี | มี UI | Partial | room graph ดีเป็นฐาน แต่ยังไม่ใช่ layer เดียวกับ world locations, doors, NPCs และ combat zones |
| World map, locations, exits, factions, quests | `world.ts`, map/quest components มี | มี simplified state | Partial / Model split | ต้องย้ายสู่ persisted `CampaignWorldState`; `LocationNode` และ `Connection` ต้องเป็น canonical |
| Doors/connections/secret paths | fields บางส่วน | ไม่ครบ | Missing / Partial | ต้องเก็บ open/closed/locked/blocked/secret, keys/DC/trap, discovery และ visibility/sound; ทุก subsystem query connection เดียว |
| NPC schedule, knowledge, inventory, faction relation | dialogue/memory/reputation bases มี | ไม่ authoritative | Partial / Model only | NPC ต้องมี current location, availability, state, knowledge facts และ persistent consequences |
| Quests/objectives/branches | journal/reducer state มี | modal มี | Partial | quest transitions ควรเกิดจาก typed game events ไม่ใช่ narrative text หรือ component-local mutation |

### 9) Solo UX, persistence และ product boundaries

| ความสามารถ | Engine/test | Live UI | สถานะ | หลักฐาน/ช่องว่าง/ความเสี่ยง |
|---|---|---|---|---|
| Session Zero / campaign charter | `engine/sessionZero.ts` มี tests | modal มี | **Implemented** | เป็นความแข็งแรงเฉพาะ solo play; ต้องส่ง charter เข้าสู่ DM context ทุกครั้งอย่างมี version |
| Campaign memory | `engine/campaignMemory.ts` มี tests | ใช้ใน prompt/context | Partial | จำเป็นต้องเก็บ provenance และไม่ให้ memory เปลี่ยน factual state โดยข้าม reducer |
| Sidekick/companion | `engine/sidekick.ts` มี tests | combat/modal มี | Partial | action economy, death, inventory, control authority และ level progression ต้องใช้ entity model เดียวกับ PC/NPC |
| Content management | modal/normalizers มี | มี UI | Partial | custom content ต้องมี schema, source/license metadata, validation และ campaign scope |
| Save/load/migration | `engineAdapters.ts`, store/persistence tests มี | live persistence มี | Partial | versioned save มีแล้ว แต่ combat/world/item/effect state ต้องไม่แยกเป็น blobs ที่ migrate ต่างกัน |
| Accessibility/mobile/offline | PWA assets และ responsive hooks มี | ไม่ใช่ส่วน audit กฎ | Partial | ต้องแยก acceptance ด้าน UX/security/performance ออกจาก rules compliance |

## จุดแข็งที่ควรรักษา

1. **มี engine ที่แยก domain แล้ว** — combat bridge, action economy, magic, rest, effects, movement, vision, enemy AI, progression และ equipment ให้ฐานสำหรับย้ายออกจาก component monolith ได้
2. **ทดสอบระดับพฤติกรรมมีอยู่จริง** — โดยเฉพาะ target selection, surprise, spell slot/damage, rest, shop และ oracle ช่วยป้องกัน regression ที่ผู้เล่นมองเห็น
3. **solo-play layer ชัดเจน** — Session Zero, oracle, sidekick และ campaign memory เป็นความสามารถที่เพิ่มคุณค่าเหนือ character sheet ธรรมดา
4. **AI มีโครงสร้างรับผลลัพธ์** — schema/context/adapters เป็นทิศทางที่ถูกต้อง: AI บรรยายและเสนอ intent, engine ตรวจและเปลี่ยน state
5. **มีประวัติ audit และ refactor plan** — ควรเก็บรายงานนี้เป็น baseline แล้วปรับ status เมื่อมีหลักฐาน test ใหม่ ไม่เพียงแก้ข้อความตามความรู้สึก

## Backlog แนะนำตามความเสี่ยง

### P0 — ความถูกต้องของกติกาและ state authority

| งาน | ผลลัพธ์ที่ต้องได้ | Acceptance criteria |
|---|---|---|
| P0-1: แก้ stable/0 HP state machine | Stable คง HP 0 + Unconscious; recovery เป็น event ตามกติกา | test ครอบคลุม 3 successes, damage/crit ที่ 0 HP, healing, Medicine/Healer’s Kit, 1d4-hour recovery และ instant death |
| P0-2: เปลี่ยน Concentration เป็น metadata | `SpellDef.concentration` และ source effect ID เป็น canonical; ลบ name lists | *Spiritual Weapon* ไม่ occupy concentration; actual concentration effect ซ้อนกันไม่ได้; damage/incapacitated/death จบเฉพาะ effect ที่ถูกต้อง |
| P0-3: เลือก Exhaustion ruleset เดียว | 2024 modifier pipeline เดียวและ migration ของ save | Exhaustion 1–6 ส่งผล -2×level ต่อ d20, speed -5×level, death 6 และ long rest ลด 1 ในทุก combat/travel/rest/UI path |
| P0-4: ทำ CombatBridgeState เป็น owner เดียว | UI เป็น projection/intent sender; action/HP/movement/turn/effects ไม่ถูก mutate โดย legacy fields | replay action log ผ่าน reducer และผ่าน UI ได้ state เดียวกันทุก event; ไม่มี write path สองชุดสำหรับ combat facts |
| P0-5: ให้ AI ไม่มีสิทธิ์ตัดสิน rule-bearing state | AI response เป็น narrative + typed intent; engine resolves effects | malformed/illegal DM update ถูก reject พร้อม reason; AI เปลี่ยน HP/slots/position/quest state ไม่ได้โดยตรง |

### P1 — ความครบของ feature และโลกถาวร

| งาน | ผลลัพธ์ที่ต้องได้ | Acceptance criteria |
|---|---|---|
| P1-1: spell legality/resolution schema | validator กลางตรวจ source, slot, cast time, components, range/LOS, target/AoE และ concentration | same cast intent ให้ผลเหมือนกันจาก UI, AI และ automated test; error ทุกชนิดเป็น structured reason |
| P1-2: effect/condition authority | `ActiveEffect` มี lifecycle ครบและ modifier query เดียว | test turn-start/end, save-to-end, rest expiry, immunity, nonstacking และ linked concentration effect |
| P1-3: canonical character build/progression | normalized character + class/level/feature/resource validator | character สร้าง/level/multiclass/load แล้ว validate ได้; illegal build ให้ actionable error; 12 classes มี coverage matrix ระดับ feature/resource |
| P1-4: canonical item instances/merchant state | inventory, equipment, components, charges, attunement และ trade ใช้ instance IDs | buy/sell/consume/cast/attune เปลี่ยน player + merchant atomically และ survive save/load |
| P1-5: CampaignWorldState + spatial graph | location/connection/NPC/quest authoritative และ persisted | player เห็น current location/exits/known vs unknown; door state มีผลต่อ movement/vision; save/load คง state เดียวกัน |
| P1-6: campaign clock/event queue | time advancement เป็น API เดียว | long rest, travel, scheduled NPC/quest, rest interruption และ stable recovery เกิด deterministic ตาม event log |

### P2 — ความลึกของ campaign และ polish

| งาน | ผลลัพธ์ที่ต้องได้ | Acceptance criteria |
|---|---|---|
| P2-1: travel/hazards/downtime | pace, marching order, supplies, navigation, foraging, hazards และ downtime loop | scenario tests เชื่อม weather/light/food/water/exhaustion กับ time/inventory |
| P2-2: full monster stat-block behavior | recharge, legendary/lair, senses, reach/size, morale และ alternate outcomes | sample monsters ครอบคลุม turn/resource/trigger/loot และการยุติ encounter ที่ไม่ใช่ฆ่า |
| P2-3: social/quest simulation | goals, attitude, leverage, NPC knowledge/location/schedule และ event-driven quests | interaction เดิมหลัง save/load ให้ consequence เดิม; influence cooldown และ faction effects ถูก enforce |
| P2-4: coverage/quality dashboard | machine-readable support matrix และ test-to-rule mapping | CI แสดง feature ที่ engine-only/live/tested และป้องกันการ regress status โดยไม่มี test |

## ช่องว่างของการทดสอบปัจจุบัน

ชุดทดสอบผ่านทั้งหมด แต่ยังควรเพิ่ม test ต่อไปนี้ก่อนปรับสถานะเป็น Implemented:

- การสุ่ม initiative แบบ surprise disadvantage ที่ deterministic และ turn order ของหลายฝ่าย
- Stable ที่ HP 0, death damage/critical, massive damage, knockout และ recovery timer
- Concentration จาก metadata, components/material consumption, ritual/reaction/multi-turn casting และ AoE ทุก shape
- ทุก condition ต้องมี modifier/expiry/immune/stacking tests และ integration กับ combat UI
- movement path ผ่าน difficult terrain, occupied spaces, reach, opportunity attacks, doors, vertical/alternative speeds
- test matrix ต่อ class/level สำหรับ resource gain/spend/recover และ multiclassing
- item instance lifecycle, attunement, ammo, loading, merchant stock/transaction rollback และ persistence migration
- world graph, discovery, locked/secret doors, NPC location/schedule, quest transition และ campaign clock
- API tests ต่อ malformed/hostile AI response, duplicate update และ conflict/retry semantics

## ข้อสรุปด้านสถาปัตยกรรม

ทิศทางเป้าหมายควรเป็นดังนี้:

```text
Player UI / AI DM narrative
            │
            ▼
Typed intent + validator
            │
            ▼
Authoritative reducers
 (CombatState, CharacterState, WorldState, InventoryState, CampaignClock)
            │
            ▼
Event log + versioned persistence
            │
            ▼
React projection / Thai narration context
```

AI DM ไม่ควรเป็นแหล่งจริงของผลลูกเต๋า, HP, spell slot, target legality, action economy หรือ world mutation. หน้าที่ที่เหมาะสมคือเสนอ fiction และ intent ภายใต้ Session Zero/campaign memory; engine เป็นผู้ตรวจและ resolve ผลกติกาที่ตรวจซ้ำได้

## การอัปเดตรายงานครั้งถัดไป

เมื่อแก้ feature ใด ให้ปรับพร้อมกัน 4 ส่วน: (1) status ใน matrix, (2) code evidence, (3) test ชนิด engine และ live UI ที่เกี่ยวข้อง, (4) migration/compatibility note หากเปลี่ยน save state. ห้ามยกระดับจาก Partial เป็น Implemented เพียงเพราะมี data catalog หรือ unit test โดยไม่มีหลักฐานว่า live flow ใช้ state authority เดียวกัน
