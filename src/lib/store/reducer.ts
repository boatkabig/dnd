/**
 * Game store — pure reducer.
 *
 * `dispatch(action)` routes here. Every branch returns a BRAND-NEW GameState
 * and never mutates its input, so a partial commit is structurally impossible:
 * the new state object is assembled in full and returned only at the very end.
 *
 * `APPLY_DM_UPDATES` additionally wraps its body in a try/catch — if a
 * malformed payload throws mid-application, the reducer discards the
 * half-built draft and returns the ORIGINAL state plus a single "update
 * failed" notice. Contrast with the legacy applyUpdates(), which fired
 * setQuests()/setGameTime()/setPhase() as it went and could leave those
 * slices committed while the character was thrown away.
 */

import { XP_THRESHOLDS, CONDITIONS_TH } from "../gameData";
import { applyDamage, applyHeal, readHpState } from "../engine/hpState";
import type {
  Action,
  Buff,
  GameState,
  GameTime,
  LogEntry,
  LogEntryType,
  PlayerState,
  ValidUpdates,
} from "./types";

/* ---- pure log-entry builder (deterministic id via seq) ---- */

interface Draft {
  player: PlayerState;
  quests: GameState["quests"];
  time: GameTime;
  phase: string;
  pending: GameState["pending"];
  entries: LogEntry[];
  seq: number;
}

function pushLog(d: Draft, type: LogEntryType, text: string): void {
  d.entries.push({ id: `log-${d.seq}`, type, text });
  d.seq += 1;
}

/** Shallow-clone the mutable slices of state into an editable draft. */
function toDraft(state: GameState): Draft {
  return {
    player: {
      ...state.player,
      deathSaves: { ...state.player.deathSaves },
      inventory: [...state.player.inventory],
      conditions: [...state.player.conditions],
      buffs: state.player.buffs.map((b) => ({ ...b })),
      feats: [...state.player.feats],
      npcAttitudes: { ...state.player.npcAttitudes },
      factionReputation: { ...state.player.factionReputation },
    },
    quests: state.quests.map((q) => ({ ...q, objectives: q.objectives.map((o) => ({ ...o })) })),
    time: { ...state.time },
    phase: state.phase,
    pending: { ...state.pending },
    entries: [],
    seq: state._seq,
  };
}

/** Fold a finished draft back into an immutable GameState. */
function commit(state: GameState, d: Draft): GameState {
  return {
    player: d.player,
    quests: d.quests,
    time: d.time,
    phase: d.phase,
    log: d.entries.length ? [...state.log, ...d.entries] : state.log,
    pending: d.pending,
    _seq: d.seq,
  };
}

/* ---- helpers ---- */

function addHours(time: GameTime, hours: number): GameTime {
  const totalHours = time.day * 24 + time.hour + hours;
  return { day: Math.floor(totalHours / 24), hour: ((totalHours % 24) + 24) % 24 };
}

/** Highest level whose XP threshold is met (1..20). */
function levelForXp(xp: number): number {
  let level = 1;
  while (level < 20 && xp >= XP_THRESHOLDS[level]) level += 1;
  return level;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/* ======================================================================
 * APPLY_DM_UPDATES — the atomic state-mutation vector
 * ====================================================================== */

function applyDmUpdates(d: Draft, u: ValidUpdates): void {
  const p = d.player;

  // --- HP (routed through the engine HP-0 state machine: tempHp absorbs first,
  //     drop-to-0 adds Unconscious + fresh death saves + massive-death, heal-from-0
  //     clears the dying state) ---
  if (u.hp_delta) {
    if (u.hp_delta < 0) {
      const tempBefore = p.tempHp;
      const dr = applyDamage(readHpState(p), -u.hp_delta);
      const absorbed = tempBefore - dr.tempHp;
      p.tempHp = dr.tempHp;
      p.hp = dr.hp;
      p.deathSaves = dr.deathSaves;
      p.conditions = dr.conditions;
      p.dead = dr.dead;
      const tail = `${p.hp}/${p.maxHp}${p.tempHp > 0 ? ` +${p.tempHp} temp` : ""}`;
      if (dr.instantDeath) pushLog(d, "system", `HP ${u.hp_delta} → ${tail} · ☠️ ความเสียหายมหาศาล — เสียชีวิตทันที`);
      else if (dr.justDowned) pushLog(d, "system", `HP ${u.hp_delta} → ${tail} · 💀 หมดสติที่ 0 HP — ต้องทอย Death Save`);
      else if (absorbed > 0) pushLog(d, "system", `HP ${u.hp_delta} (Temp HP ดูด ${absorbed}) → ${tail}`);
      else pushLog(d, "system", `HP ${u.hp_delta} → ${tail}`);
      if (p.dead) d.phase = "dead";
    } else {
      const hr = applyHeal(readHpState(p), u.hp_delta);
      p.hp = hr.hp;
      p.deathSaves = hr.deathSaves;
      p.conditions = hr.conditions;
      pushLog(d, "system", `HP +${u.hp_delta} → ${p.hp}/${p.maxHp}${p.tempHp > 0 ? ` +${p.tempHp} temp` : ""}${hr.revived ? " · 🩹 ฟื้นจากภาวะใกล้ตาย (ล้าง Death Save)" : ""}`);
    }
  }

  if (u.temp_hp) {
    p.tempHp = Math.max(p.tempHp, u.temp_hp);
    pushLog(d, "system", `🛡️ Temporary HP +${u.temp_hp} (ตอนนี้ ${p.tempHp} temp HP)`);
  }

  if (u.gold_delta) {
    p.gold = Math.max(0, p.gold + u.gold_delta);
    pushLog(d, "system", `ทอง ${u.gold_delta > 0 ? "+" : ""}${u.gold_delta} → ${p.gold} gp`);
  }

  // --- Quests ---
  if (u.quest_add) {
    const q = u.quest_add;
    if (!d.quests.find((x) => x.id === q.id)) {
      d.quests = [...d.quests, { ...q, status: "active", objectives: q.objectives.map((o) => ({ text: o.text, done: o.done ?? false })) }];
      pushLog(d, "system", `📜 เควสต์ใหม่: ${q.title} — ${q.description}`);
    }
  }
  if (u.quest_update) {
    const qu = u.quest_update;
    d.quests = d.quests.map((q) => {
      if (q.id !== qu.id) return q;
      if (qu.complete_objective !== undefined) {
        return { ...q, objectives: q.objectives.map((o, i) => (i === qu.complete_objective ? { ...o, done: true } : o)) };
      }
      if (qu.status) return { ...q, status: qu.status };
      return q;
    });
    if (qu.status === "completed") pushLog(d, "system", `✅ เควสต์เสร็จสิ้น: ${qu.id}`);
    if (qu.status === "failed") pushLog(d, "system", `❌ เควสต์ล้มเหลว: ${qu.id}`);
  }

  // --- Time (rest timers advance with the clock) ---
  if (u.time_delta) {
    d.time = addHours(d.time, u.time_delta);
    p.lastLongRestHoursAgo += u.time_delta;
    p.lastShortRestHoursAgo += u.time_delta;
    pushLog(d, "system", `⏰ เวลาผ่านไป ${u.time_delta} ชม. → วันที่ ${d.time.day} เวลา ${String(d.time.hour).padStart(2, "0")}:00`);
  }

  // --- Items ---
  for (const it of u.items_use ?? []) {
    const idx = p.inventory.indexOf(it);
    if (idx < 0) { pushLog(d, "system", `ไม่มี ${it} ในเป้สัมภาระ`); continue; }
    p.inventory.splice(idx, 1);
    pushLog(d, "system", `ใช้: ${it}`);
  }
  for (const it of u.items_add ?? []) {
    p.inventory.push(it);
    pushLog(d, "system", `ได้รับ: ${it}`);
    const scroll = it.match(/^Spell Scroll:\s*(.+)$/i);
    if (scroll) pushLog(d, "system", `📖 พบ Spell Scroll — เปิดสมุดเวทมนตร์ (📜 → เวทมนตร์) เพื่อเรียน ${scroll[1]}`);
    const feat = it.match(/^Feat:\s*(.+)$/i);
    if (feat) {
      const featIndex = feat[1].toLowerCase().replace(/\s+/g, "-");
      if (!p.feats.includes(featIndex)) {
        p.feats.push(featIndex);
        pushLog(d, "system", `⭐ ได้รับ Feat: ${feat[1]} — ดูในหน้าตัวละคร`);
      }
    }
  }
  for (const it of u.items_remove ?? []) {
    const i = p.inventory.indexOf(it);
    if (i >= 0) { p.inventory.splice(i, 1); pushLog(d, "system", `เสีย: ${it}`); }
  }

  // --- Conditions (ids already validated by dmSchema) ---
  // Only ids with a Thai display label are added (mirrors legacy DnDSolo, which
  // silently drops e.g. "exhaustion" — tracked separately as exhaustionLevel).
  for (const cd of u.conditions_add ?? []) {
    if (!p.conditions.includes(cd) && CONDITIONS_TH[cd]) { p.conditions.push(cd); pushLog(d, "system", `สภาวะ: ${CONDITIONS_TH[cd]}`); }
  }
  for (const cd of u.conditions_remove ?? []) {
    const i = p.conditions.indexOf(cd);
    if (i >= 0) { p.conditions.splice(i, 1); pushLog(d, "system", `หายจากสภาวะ: ${cd}`); }
  }

  // --- Buffs / debuffs ---
  for (const raw of u.buffs_add ?? []) {
    const buff: Buff = typeof raw === "string"
      ? { name: raw, type: "buff", duration: -1, source: "unknown", effect_desc: "" }
      : { name: raw.name, type: raw.type, duration: raw.duration, source: raw.source ?? "unknown", effect_desc: raw.effect_desc ?? "" };
    p.buffs = p.buffs.filter((x) => x.name !== buff.name);
    p.buffs.push(buff);
    const dur = buff.duration === 0 ? "ทันที" : buff.duration === -1 ? "จนกว่าจะ long rest" : `${buff.duration} รอบ`;
    pushLog(d, "system", `${buff.type === "debuff" ? "🔻 Debuff" : "⬆️ Buff"}: ${buff.name} (${dur})${buff.effect_desc ? ` — ${buff.effect_desc}` : ""}`);
  }
  for (const name of u.buffs_remove ?? []) {
    const before = p.buffs.length;
    p.buffs = p.buffs.filter((x) => x.name !== name);
    if (p.buffs.length < before) pushLog(d, "system", `Buff หมดไป: ${name}`);
  }

  // --- XP (accumulate; leave class math to the engine via pending.levelUp) ---
  if (u.xp_award) {
    p.xp += u.xp_award;
    pushLog(d, "system", `+${u.xp_award} XP (รวม ${p.xp})`);
    const newLevel = levelForXp(p.xp);
    if (newLevel > p.level) {
      pushLog(d, "system", `🎉 ถึงเกณฑ์ Level ${newLevel}! — เปิดหน้าตัวละครเพื่อยืนยันเลเวลอัป`);
      d.pending.levelUp = true;
    }
  }

  // --- Loot ("N gp" folds into gold, else an inventory item) ---
  for (const item of u.loot_drop ?? []) {
    const goldMatch = item.match(/^(\d+)\s*gp$/i);
    if (goldMatch) {
      p.gold += parseInt(goldMatch[1], 10);
      pushLog(d, "system", `💰 ได้รับ ${goldMatch[1]} ทอง`);
    } else {
      p.inventory.push(item);
      pushLog(d, "system", `📦 ได้รับ: ${item}`);
    }
  }

  // --- NPC / faction ---
  if (u.npc_attitude) {
    const a = u.npc_attitude;
    p.npcAttitudes[a.npc_id] = a.attitude;
    pushLog(d, "system", `👤 ${a.npc_id} ท่าทีเปลี่ยนเป็น: ${a.attitude}${a.reason ? ` (${a.reason})` : ""}`);
  }
  if (u.faction_reputation) {
    const f = u.faction_reputation;
    p.factionReputation[f.faction_id] = (p.factionReputation[f.faction_id] ?? 0) + f.delta;
    pushLog(d, "system", `🏛️ ชื่อเสียงกับ ${f.faction_id}: ${f.delta > 0 ? "+" : ""}${f.delta} → ${p.factionReputation[f.faction_id]}`);
  }

  // --- Environment ---
  if (u.weather) { p.weather = u.weather; pushLog(d, "system", `🌤️ อากาศเปลี่ยนเป็น: ${u.weather}`); }
  if (u.environment) { p.environmentEffect = u.environment; pushLog(d, "system", `🌍 สภาพแวดล้อม: ${u.environment}`); }
  if (u.scene_type) { p.sceneType = u.scene_type; pushLog(d, "system", `🎬 ประเภทฉาก: ${u.scene_type}`); }

  // --- Level-up choice offered by DM ---
  if (u.level_up_choice) {
    p.pendingAsi += 1;
    pushLog(d, "system", `⬆️ ต้องเลือก Ability Score Improvement หรือ Feat — เปิดหน้าตัวละคร`);
  }

  // --- Rest (store only flags it; the engine applies the actual rest) ---
  if (u.rest_trigger === "short") { d.pending.shortRest = true; pushLog(d, "system", `⛺ DM สั่งให้พักสั้น — กดปุ่ม "พักสั้น" เพื่อพัก`); }
  else if (u.rest_trigger === "long") { d.pending.longRest = true; pushLog(d, "system", `🌙 DM สั่งให้พักยาว — กดปุ่ม "พักยาว" เพื่อพัก`); }

  // --- Exhaustion (death at 6) ---
  if (u.exhaustion_delta) {
    p.exhaustionLevel = clamp(p.exhaustionLevel + u.exhaustion_delta, 0, 6);
    const reason = u.exhaustion_delta > 0 ? "จากสาเหตุที่ DM กำหนด" : "ฟื้นตัว";
    pushLog(d, "system", `😮‍💨 Exhaustion ${u.exhaustion_delta > 0 ? "+" : ""}${u.exhaustion_delta} → Lv.${p.exhaustionLevel} (${reason})${p.exhaustionLevel >= 6 ? " (ตาย!)" : ""}`);
    if (p.exhaustionLevel >= 6) { p.dead = true; d.phase = "dead"; }
  }
}

/* ======================================================================
 * REDUCER
 * ====================================================================== */

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "APPLY_DM_UPDATES": {
      if (!action.updates) return state;
      const d = toDraft(state);
      try {
        applyDmUpdates(d, action.updates);
      } catch (err) {
        // Discard the half-built draft entirely — original state is untouched.
        const fail = toDraft(state);
        pushLog(fail, "system", `⚠️ DM update ล้มเหลว — ข้ามการเปลี่ยนแปลงทั้งหมด (${err instanceof Error ? err.message : String(err)})`);
        return commit(state, fail);
      }
      return commit(state, d);
    }

    case "SET_PHASE": {
      if (action.phase === state.phase) return state;
      return { ...state, phase: action.phase };
    }

    case "ADD_LOG": {
      const d = toDraft(state);
      pushLog(d, action.entryType ?? "system", action.text);
      return commit(state, d);
    }

    case "CLEAR_PENDING": {
      if (!state.pending[action.key]) return state;
      return { ...state, pending: { ...state.pending, [action.key]: false } };
    }

    default:
      return state;
  }
}
