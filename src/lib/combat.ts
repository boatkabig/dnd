/**
 * Combat System — Combat Flow Controller.
 *
 * Responsibilities:
 *   Manages the FLOW of combat (start → initiative → rounds → turns → end).
 *   Does NOT contain dice logic, action definitions, or spell rules.
 *   Delegates to:
 *     - diceEngine   (roll dice)
 *     - actionSystem (check action availability, consume resources)
 *     - movement     (grid movement, opportunity attacks)
 *     - skills       (grapple/shove contested checks)
 *     - gameData     (conditions, damage modifiers, XP)
 *
 * 17 sub-systems:
 *   6.1  Combat Start    6.7  Attack         6.13 Combat Resources
 *   6.2  Initiative      6.8  Damage         6.14 Combat Effects
 *   6.3  Surprise        6.9  Healing        6.15 Combat Position
 *   6.4  Round           6.10 Death          6.16 Combat Events
 *   6.5  Turn            6.11 Opportunity    6.17 End Combat
 *   6.6  Targeting       6.12 Grapple/Shove
 */

import { roll, rollD20, type RollContext } from "./diceEngine";
import { mod, profByLevel, applyDamageModifiers, XP_THRESHOLDS } from "./gameData";
import {
  CONDITION_MOVEMENT, getReach, checkOpportunityAttack, type MovementType,
} from "./movement";

/* ======================================================================
 * TYPES
 * ====================================================================== */

export interface Combatant {
  uid: string;
  name: string;
  isPlayer: boolean;
  hp: number;
  maxHp: number;
  ac: number;
  initiative: number;
  pos: { x: number; y: number };
  reach: number;
  conditions: string[];
  resistances?: string[];
  vulnerabilities?: string[];
  immunities?: string[];
  // Resources
  hasAction: boolean;
  hasBonusAction: boolean;
  hasReaction: boolean;
  movementLeft: number;
  speed: number;
  // State flags
  surprised?: boolean;
  dead?: boolean;
  // Monster-specific
  attacks?: { name: string; atk: number; dmg: string; dmgType?: string }[];
  xp?: number;
}

export interface CombatState {
  combatants: Combatant[];
  initiativeOrder: { uid: string; name: string; initiative: number; isPlayer: boolean }[];
  currentTurnIdx: number;
  round: number;
  active: boolean;
  grid: { w: number; h: number };
  log: CombatLogEntry[];
}

export interface CombatLogEntry {
  event: CombatEventType;
  uid?: string;
  targetUid?: string;
  description: string;
  descriptionTh: string;
  timestamp: number;
}

export type CombatEventType =
  | "combat_start" | "combat_end" | "round_start" | "round_end"
  | "turn_start" | "turn_end"
  | "attack" | "hit" | "miss" | "critical_hit" | "critical_miss"
  | "damage" | "heal" | "death" | "revive"
  | "move" | "opportunity_attack" | "spell_cast" | "condition_applied" | "condition_removed"
  | "grapple" | "shove" | "dash" | "dodge" | "disengage" | "hide"
  | "buff_applied" | "buff_expired" | "resource_consumed";

/* ======================================================================
 * 6.1 COMBAT START
 * ====================================================================== */

export function startCombat(
  player: { name: string; hp: number; maxHp: number; ac: number; dex: number; pos: { x: number; y: number }; speed: number; conditions: string[]; resistances?: string[]; vulnerabilities?: string[]; immunities?: string[]; },
  enemies: Array<{ uid: string; name: string; hp: number; maxHp: number; ac: number; init: number; pos: { x: number; y: number }; attacks?: any[]; xp?: number; conditions?: string[]; resistances?: string[]; vulnerabilities?: string[]; immunities?: string[]; }>,
  grid: { w: number; h: number },
  surprise: boolean = false,
): CombatState {
  // D&D 2024 Surprise: NOT a turn-skip — surprised creatures roll Initiative with Disadvantage.
  // Source: D&D Beyond Free Rules 2024 — "Initiative". They can act/move/react normally on round 1.
  // Roll initiative for everyone
  const playerInit = rollD20(mod(player.dex)); // player is the ambusher → no disadvantage
  const initOrder: CombatState["initiativeOrder"] = [
    { uid: "player", name: player.name, initiative: playerInit.total, isPlayer: true },
  ];

  const combatants: Combatant[] = [
    {
      uid: "player", name: player.name, isPlayer: true,
      hp: player.hp, maxHp: player.maxHp, ac: player.ac,
      initiative: playerInit.total,
      pos: player.pos, reach: 1,
      conditions: [...(player.conditions || [])],
      resistances: player.resistances, vulnerabilities: player.vulnerabilities, immunities: player.immunities,
      hasAction: true, hasBonusAction: true, hasReaction: true,
      movementLeft: Math.floor(player.speed / 5), speed: player.speed,
      surprised: surprise ? false : undefined, // player ambusher is not surprised
      dead: false,
    },
  ];

  for (const e of enemies) {
    // D&D 2024: surprised enemies roll Initiative with Disadvantage
    const eInit = surprise ? rollD20(e.init, "disadvantage") : rollD20(e.init);
    initOrder.push({ uid: e.uid, name: e.name, initiative: eInit.total, isPlayer: false });
    combatants.push({
      uid: e.uid, name: e.name, isPlayer: false,
      hp: e.hp, maxHp: e.maxHp, ac: e.ac,
      initiative: eInit.total,
      pos: e.pos, reach: 1,
      conditions: [...(e.conditions || [])],
      resistances: e.resistances, vulnerabilities: e.vulnerabilities, immunities: e.immunities,
      hasAction: true, hasBonusAction: true, hasReaction: true,
      movementLeft: 6, speed: 30,
      surprised: surprise ? true : undefined, // flag for UI display only (D&D 2024: still acts normally)
      attacks: e.attacks, xp: e.xp,
      dead: false,
    });
  }

  // Sort by initiative descending
  initOrder.sort((a, b) => b.initiative - a.initiative);

  const log: CombatLogEntry[] = [
    {
      event: "combat_start", description: `Combat starts! Initiative order: ${initOrder.map((i) => `${i.name} (${i.initiative})`).join(", ")}`,
      descriptionTh: `เริ่มการต่อสู้! ลำดับ Initiative: ${initOrder.map((i) => `${i.name} (${i.initiative})`).join(", ")}`,
      timestamp: Date.now(),
    },
  ];

  if (surprise) {
    log.push({
      event: "combat_start", description: "Surprise! Enemies rolled Initiative with Disadvantage (D&D 2024).",
      descriptionTh: "ศัตรูถูก Surprise — ทอย Initiative เสียเปรียบ (D&D 2024: ไม่ข้ามเทิร์น แค่ Disadvantage)",
      timestamp: Date.now(),
    });
  }

  return {
    combatants,
    initiativeOrder: initOrder,
    currentTurnIdx: 0,
    round: 1,
    active: true,
    grid,
    log,
  };
}

/* ======================================================================
 * 6.2 INITIATIVE
 * ====================================================================== */

export function getInitiativeOrder(state: CombatState) {
  return state.initiativeOrder;
}

export function getCurrentCombatant(state: CombatState): Combatant | null {
  const entry = state.initiativeOrder[state.currentTurnIdx];
  if (!entry) return null;
  return state.combatants.find((c) => c.uid === entry.uid) || null;
}

export function advanceToNextCombatant(state: CombatState): CombatState {
  let nextIdx = state.currentTurnIdx + 1;
  if (nextIdx >= state.initiativeOrder.length) {
    // New round
    nextIdx = 0;
    state.round++;
    state.log.push({
      event: "round_start", description: `Round ${state.round} begins`,
      descriptionTh: `เริ่มรอบที่ ${state.round}`,
      timestamp: Date.now(),
    });
    // Reset resources for all combatants
    for (const c of state.combatants) {
      if (c.dead) continue;
      c.hasAction = true;
      c.hasBonusAction = true;
      c.hasReaction = true;
      c.movementLeft = Math.floor(c.speed / 5);
    }
  }
  state.currentTurnIdx = nextIdx;

  // Skip dead combatants
  const current = getCurrentCombatant(state);
  if (current?.dead) {
    return advanceToNextCombatant(state);
  }

  // Turn start effects
  if (current) {
    state.log.push({
      event: "turn_start", uid: current.uid,
      description: `${current.name}'s turn`,
      descriptionTh: `เทิร์นของ ${current.name}`,
      timestamp: Date.now(),
    });
    // D&D 2024: surprise is now a Disadvantage on Initiative only — flag is cleared at end of round 1
    if (current.surprised) {
      current.surprised = false;
      state.log.push({
        event: "turn_start", uid: current.uid,
        description: `${current.name} is no longer surprised`,
        descriptionTh: `${current.name} หมดสภาพ surprised แล้ว`,
        timestamp: Date.now(),
      });
    }
  }

  return state;
}

/* ======================================================================
 * 6.5 TURN MANAGEMENT
 * ====================================================================== */

export function startTurn(state: CombatState): CombatState {
  const current = getCurrentCombatant(state);
  if (!current) return state;

  // Start of turn: clear surprise, reset dodge, stand from prone (auto)
  if (current.surprised) {
    current.surprised = false;
  }

  // Auto-stand from prone at start of turn (uses half movement)
  const proneIdx = current.conditions.indexOf("prone");
  if (proneIdx >= 0) {
    const standCost = Math.floor(current.speed / 2 / 5);
    current.movementLeft = Math.max(0, current.movementLeft - standCost);
    current.conditions.splice(proneIdx, 1);
    state.log.push({
      event: "turn_start", uid: current.uid,
      description: `${current.name} stands up (costs ${standCost} movement)`,
      descriptionTh: `${current.name} ลุกขึ้นยืน (ใช้ movement ${standCost} ช่อง)`,
      timestamp: Date.now(),
    });
  }

  return state;
}

export function endTurn(state: CombatState): CombatState {
  const current = getCurrentCombatant(state);
  if (!current) return state;

  state.log.push({
    event: "turn_end", uid: current.uid,
    description: `${current.name} ends their turn`,
    descriptionTh: `${current.name} จบเทิร์น`,
    timestamp: Date.now(),
  });

  // Tick buff durations
  // (delegated to the main component which tracks buffs)

  return advanceToNextCombatant(state);
}

/* ======================================================================
 * 6.6 TARGETING
 * ====================================================================== */

export interface TargetValidation {
  valid: boolean;
  reason: string;
  reasonTh: string;
}

export function validateTarget(
  attacker: Combatant,
  target: Combatant,
  range: number,  // in squares (1 = melee, 5 = ranged 25ft)
): TargetValidation {
  if (target.dead) {
    return { valid: false, reason: "Target is dead", reasonTh: "เป้าหมายตายแล้ว" };
  }
  const dist = Math.abs(attacker.pos.x - target.pos.x) + Math.abs(attacker.pos.y - target.pos.y);
  if (dist > range) {
    return {
      valid: false,
      reason: `Target is ${dist} squares away (max ${range})`,
      reasonTh: `เป้าหมายอยู่ไกลเกินไป (${dist} ช่อง, ระยะสูงสุด ${range})`,
    };
  }
  return { valid: true, reason: "OK", reasonTh: "ผ่าน" };
}

/* ======================================================================
 * 6.7 ATTACK
 * ====================================================================== */

export interface AttackResult {
  hit: boolean;
  isCrit: boolean;
  isFumble: boolean;
  die: number;
  total: number;
  targetAC: number;
  damage?: number;
  damageType?: string;
  damageHistory?: string;
  history: string;
}

export function resolveAttack(
  attacker: Combatant,
  target: Combatant,
  attackModifier: number,
  damageExpr: string,
  damageType: string = "slashing",
  critThreshold: number = 20,
  advantage: boolean = false,
  disadvantage: boolean = false,
): AttackResult {
  // Check conditions that affect the attack
  let adv: "none" | "advantage" | "disadvantage" = "none";
  // Unseen attacker / invisible / hidden = advantage
  if (attacker.conditions.includes("invisible") || advantage) adv = "advantage";
  // Blinded / poisoned / frightened / prone / restrained = disadvantage
  if (["blinded", "poisoned", "frightened", "restrained", "prone"].some((c) => attacker.conditions.includes(c))) {
    adv = adv === "advantage" ? "none" : "disadvantage";
  }
  // Target dodging = disadvantage
  if (target.conditions.includes("dodge" as any) || disadvantage) {
    adv = adv === "advantage" ? "none" : "disadvantage";
  }

  const ctx: RollContext = { advantage: adv === "advantage", disadvantage: adv === "disadvantage" };
  const result = roll(`1d20+${attackModifier}`, ctx);
  const die = result.naturalDie ?? 0;
  const isCrit = die >= critThreshold;
  const isFumble = die === 1;

  // Natural 20 = auto hit, Natural 1 = auto miss
  const hit = !isFumble && (isCrit || result.total >= target.ac);

  // Calculate damage if hit
  let damage: number | undefined;
  let damageHistory: string | undefined;
  if (hit) {
    // Roll damage (crit doubles dice)
    let dmgExpr = damageExpr;
    if (isCrit) {
      // Double the dice count
      const parsed = damageExpr.match(/^(\d+)d(\d+)([+-]\d+)?$/);
      if (parsed) {
        const count = parseInt(parsed[1]) * 2;
        const sides = parseInt(parsed[2]);
        const modPart = parsed[3] || "";
        dmgExpr = `${count}d${sides}${modPart}`;
      }
    }
    const dmgResult = roll(dmgExpr);
    let rawDmg = dmgResult.total;

    // Apply resistance/vulnerability/immunity from target
    rawDmg = applyDamageModifiers(rawDmg, damageType, {
      resistances: target.resistances,
      vulnerabilities: target.vulnerabilities,
      immunities: target.immunities,
    });

    damage = rawDmg;
    damageHistory = dmgResult.history;
  }

  return {
    hit,
    isCrit,
    isFumble,
    die,
    total: result.total,
    targetAC: target.ac,
    damage,
    damageType,
    damageHistory,
    history: result.history,
  };
}

/* ======================================================================
 * 6.8 DAMAGE
 * ====================================================================== */

export function applyDamage(
  target: Combatant,
  damage: number,
  damageType: string,
): { newHp: number; actualDamage: number; killed: boolean } {
  const actualDamage = applyDamageModifiers(damage, damageType, {
    resistances: target.resistances,
    vulnerabilities: target.vulnerabilities,
    immunities: target.immunities,
  });
  target.hp = Math.max(0, target.hp - actualDamage);
  const killed = target.hp <= 0;
  if (killed) {
    target.dead = true;
  }
  return { newHp: target.hp, actualDamage, killed };
}

/* ======================================================================
 * 6.9 HEALING
 * ====================================================================== */

export function applyHealing(
  target: Combatant,
  amount: number,
): { newHp: number; revived: boolean } {
  const wasDown = target.hp <= 0;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  if (wasDown && target.hp > 0) {
    target.dead = false;
    target.conditions = target.conditions.filter((c) => c !== "unconscious");
  }
  return { newHp: target.hp, revived: wasDown && target.hp > 0 };
}

export function applyTempHP(
  target: Combatant,
  amount: number,
): { tempHp: number } {
  // Temp HP doesn't stack — take the higher
  const current = (target as any).tempHp || 0;
  (target as any).tempHp = Math.max(current, amount);
  return { tempHp: (target as any).tempHp };
}

/* ======================================================================
 * 6.10 DEATH
 * ====================================================================== */

export interface DeathSaveResult {
  die: number;
  outcome: "critical_fail" | "fail" | "success" | "recover";
  successes: number;
  failures: number;
  dead: boolean;
  revived: boolean;
}

export function rollDeathSave(target: Combatant): DeathSaveResult {
  const result = roll("1d20");
  const die = result.naturalDie ?? 0;

  let successes = (target as any).deathSaves?.s || 0;
  let failures = (target as any).deathSaves?.f || 0;
  let outcome: DeathSaveResult["outcome"];
  let dead = false;
  let revived = false;

  if (die === 1) {
    failures += 2;
    outcome = "critical_fail";
  } else if (die === 20) {
    target.hp = 1;
    target.dead = false;
    target.conditions = target.conditions.filter((c) => c !== "unconscious");
    revived = true;
    outcome = "recover";
  } else if (die >= 10) {
    successes++;
    outcome = "success";
  } else {
    failures++;
    outcome = "fail";
  }

  if (failures >= 3) {
    dead = true;
    target.dead = true;
  }
  if (successes >= 3 && !revived) {
    // Stabilized — not dead, but still at 0 HP
    target.conditions = target.conditions.filter((c) => c !== "unconscious");
    successes = 0;
    failures = 0;
  }

  (target as any).deathSaves = { s: successes, f: failures };

  return { die, outcome, successes, failures, dead, revived };
}

/* ======================================================================
 * 6.11 OPPORTUNITY ATTACK
 * ====================================================================== */

export function checkOpportunity(
  mover: Combatant,
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
  enemies: Combatant[],
  movementType: MovementType = "walk",
  disengaged: boolean = false,
): { provokes: boolean; attacker?: Combatant; reasonTh: string } {
  const enemyPositions = enemies
    .filter((e) => !e.dead && e.hasReaction)
    .map((e) => ({ uid: e.uid, pos: e.pos, reach: e.reach }));

  const result = checkOpportunityAttack(fromPos, toPos, enemyPositions, movementType, disengaged);

  if (!result.provokes) return { provokes: false, reasonTh: result.reasonTh };

  // Find the attacker
  const attacker = enemies.find((e) => {
    const distFrom = Math.abs(fromPos.x - e.pos.x) + Math.abs(fromPos.y - e.pos.y);
    const distTo = Math.abs(toPos.x - e.pos.x) + Math.abs(toPos.y - e.pos.y);
    return distFrom <= e.reach && distTo > e.reach && !e.dead && e.hasReaction;
  });

  return { provokes: true, attacker: attacker || undefined, reasonTh: result.reasonTh };
}

/* ======================================================================
 * 6.12 GRAPPLE & SHOVE
 * ====================================================================== */

export function resolveGrapple(
  attacker: Combatant,
  target: Combatant,
  attackerMod: number,
  defenderMod: number,
): { success: boolean; roll: number; dc: number; historyTh: string } {
  const result = roll(`1d20+${attackerMod}`);
  const dc = 8 + defenderMod;
  const success = result.total >= dc;

  if (success) {
    target.conditions.push("restrained");
  }

  return {
    success,
    roll: result.total,
    dc,
    historyTh: `${attacker.name} จับตรึง ${target.name}: d20(${result.naturalDie})+${attackerMod}=${result.total} vs DC ${dc} → ${success ? "สำเร็จ (Restrained)" : "ล้มเหลว"}`,
  };
}

export function resolveShove(
  attacker: Combatant,
  target: Combatant,
  attackerMod: number,
  defenderMod: number,
  mode: "prone" | "push",
): { success: boolean; roll: number; dc: number; historyTh: string } {
  const result = roll(`1d20+${attackerMod}`);
  const dc = 8 + defenderMod;
  const success = result.total >= dc;

  if (success) {
    if (mode === "prone") {
      target.conditions.push("prone");
    }
    // Push: move target 1 square away (handled by caller)
  }

  return {
    success,
    roll: result.total,
    dc,
    historyTh: `${attacker.name} ผลัก${mode === "prone" ? "ให้ล้ม" : "ถอย"} ${target.name}: d20(${result.naturalDie})+${attackerMod}=${result.total} vs DC ${dc} → ${success ? "สำเร็จ" : "ล้มเหลว"}`,
  };
}

/* ======================================================================
 * 6.13 COMBAT RESOURCES
 * ====================================================================== */

export function consumeAction(c: Combatant): boolean {
  if (!c.hasAction) return false;
  c.hasAction = false;
  return true;
}

export function consumeBonusAction(c: Combatant): boolean {
  if (!c.hasBonusAction) return false;
  c.hasBonusAction = false;
  return true;
}

export function consumeReaction(c: Combatant): boolean {
  if (!c.hasReaction) return false;
  c.hasReaction = false;
  return true;
}

export function consumeMovement(c: Combatant, cost: number): boolean {
  if (cost > c.movementLeft) return false;
  c.movementLeft -= cost;
  return true;
}

/* ======================================================================
 * 6.15 COMBAT POSITION
 * ====================================================================== */

export function getDistance(a: Combatant, b: Combatant): number {
  return Math.abs(a.pos.x - b.pos.x) + Math.abs(a.pos.y - b.pos.y);
}

export function isAdjacent(a: Combatant, b: Combatant): boolean {
  return getDistance(a, b) <= 1;
}

export function isInReach(attacker: Combatant, target: Combatant): boolean {
  return getDistance(attacker, target) <= attacker.reach;
}

/* ======================================================================
 * 6.16 COMBAT EVENTS
 * ====================================================================== */

export function logEvent(state: CombatState, entry: Omit<CombatLogEntry, "timestamp">): void {
  state.log.push({ ...entry, timestamp: Date.now() });
}

/* ======================================================================
 * 6.17 END COMBAT
 * ====================================================================== */

export interface CombatEndResult {
  victor: "player" | "enemies" | "none";
  xpAwarded: number;
  log: CombatLogEntry[];
}

export function checkCombatEnd(state: CombatState): boolean {
  const player = state.combatants.find((c) => c.isPlayer);
  const enemies = state.combatants.filter((c) => !c.isPlayer);

  if (player?.dead) return true;
  if (enemies.every((e) => e.dead)) return true;
  return false;
}

export function endCombat(state: CombatState): CombatEndResult {
  state.active = false;
  const player = state.combatants.find((c) => c.isPlayer);
  const enemies = state.combatants.filter((c) => !c.isPlayer);

  let victor: "player" | "enemies" | "none" = "none";
  let xpAwarded = 0;

  if (player?.dead) {
    victor = "enemies";
  } else if (enemies.every((e) => e.dead)) {
    victor = "player";
    xpAwarded = enemies.reduce((sum, e) => sum + (e.xp || 50), 0);
  }

  state.log.push({
    event: "combat_end",
    description: victor === "player" ? `Player wins! XP awarded: ${xpAwarded}` : victor === "enemies" ? "Player is defeated!" : "Combat ends in a draw.",
    descriptionTh: victor === "player" ? `ผู้เล่นชนะ! ได้รับ XP: ${xpAwarded}` : victor === "enemies" ? "ผู้เล่นพ่ายแพ้!" : "การต่อสู้จบลง",
    timestamp: Date.now(),
  });

  return { victor, xpAwarded, log: state.log };
}

/* ======================================================================
 * 6.3 SURPRISE
 * ====================================================================== */

export function isSurprised(c: Combatant): boolean {
  return c.surprised === true;
}

export function clearSurprise(c: Combatant): void {
  c.surprised = false;
}

/* ======================================================================
 * 6.4 ROUND
 * ====================================================================== */

export function startRound(state: CombatState): CombatState {
  state.log.push({
    event: "round_start",
    description: `Round ${state.round} begins`,
    descriptionTh: `เริ่มรอบที่ ${state.round}`,
    timestamp: Date.now(),
  });
  return state;
}

export function endRound(state: CombatState): CombatState {
  state.log.push({
    event: "round_end",
    description: `Round ${state.round} ends`,
    descriptionTh: `จบรอบที่ ${state.round}`,
    timestamp: Date.now(),
  });
  return state;
}
