"use client";

/**
 * Combat resolution helpers — extracted from DnDSolo.tsx (Phase 1 de-monolith).
 *
 * Pure-ish combat-turn logic that operates on the passed character/combat clones
 * and lib helpers only (no component state or refs). Anything the component owns
 * (the selected target id, logging) is injected as a parameter/callback so these
 * stay unit-testable. Moved verbatim — no behavior change.
 */
import { SIDEKICK_BASES, buildSidekick, sidekickTurnIntent, resolveSidekickAttack } from "./engine/sidekick";
import { d } from "./dndSoloShared";
import {
  rollFormula, rollD20, attackMod, saveMod, hasFeature, hasConcentration,
  getActiveConcentrationBuff, enemyHasAttackDisadv, exhaustionPenalty,
} from "./characterStats";
import { hitEnemy, applyEnemyDamage, gridDistance } from "./combatMath";
import { applyDeathSaveRoll } from "./engine/combat";
import { computeAC } from "./spells";
import { ENEMY_ADV_CONDS } from "./gameData";
import { getCombatView, endTurn } from "./engine/combatBridge";
import { runEnemyTurn, type EnemyAIDeps } from "./engine/enemyAI";
import { gainXP } from "./leveling";
import { calculateDifficulty, calculateReward, rollRewardItems } from "./encounter";
import { emitConditionApplied, emitDamageDealt, emitHeal, type PendingStateChange } from "./engineAdapters";

/**
 * Component functions the combat resolvers need but cannot import (they close over
 * the component's id counter / React setters). Injected so these stay testable.
 */
export interface CombatDeps {
  /** Build a system-log entry object (component owns the id counter). */
  entrySystem: (text: string) => any;
  /** Next monotonic log-entry id. */
  nextId: () => number;
  /** Called when the player dies (component sets phase = "dead"). */
  onDeath?: () => void;
  /** On victory, mark the current dungeon room cleared / boss defeated (touches refs). */
  onVictoryDungeon?: (entries: any[]) => void;
}

/**
 * Detect end-of-combat (all enemies down). On victory: award XP, roll loot (gold +
 * items) from the difficulty-scaled reward tables, and run the dungeon-clear hook.
 * Returns { ended, cc } — cc carries the XP/loot when ended. Extracted verbatim;
 * logging + the stateful dungeon update are injected via deps.
 */
export function checkCombatEnd(cb: any, cc: any, entries: any[], deps: CombatDeps) {
  const alive = cb.enemies.filter((e: any) => e.hpNow > 0);
  if (alive.length === 0) {
    const totalXP = cb.enemies.reduce((a: number, e: any) => a + (e.xp || 50), 0);
    const numEnemies = cb.enemies.length;
    entries.push(deps.entrySystem(`🏆 ชนะ! กำจัดศัตรูทั้งหมดแล้ว`));
    const nc = gainXP(cc, totalXP, (t) => entries.push(deps.entrySystem(t)));
    // Auto-generate loot from reward tables (difficulty from XP + party level).
    const difficulty = calculateDifficulty(totalXP, numEnemies, nc.level, 1);
    const reward = calculateReward(difficulty, totalXP, nc.level);
    const rolledItems = rollRewardItems(reward);
    if (reward.gold > 0) {
      nc.gold = (nc.gold || 0) + reward.gold;
      entries.push(deps.entrySystem(`💰 +${reward.gold} gp (loot จาก combat — ${difficulty})`));
    }
    if (rolledItems.length > 0) {
      rolledItems.forEach((item: string) => {
        nc.inventory.push(item);
        entries.push(deps.entrySystem(`📦 ได้รับ: ${item} (loot จาก combat)`));
      });
    }
    deps.onVictoryDungeon?.(entries); // Domain 36: mark room cleared / boss defeated
    return { ended: true, cc: nc };
  }
  return { ended: false, cc };
}

/**
 * Run the enemy portion of the initiative-interleaved turn loop. The bridge's own
 * turn pointer is the single source of truth for whose turn it is; each enemy acts
 * via the pure engine (runEnemyTurn) and the loop yields back the instant the
 * pointer lands on the player. Uncanny Dodge's once-per-round flag lives on cb.
 * Returns the player clone (nc). Extracted verbatim; entrySystem/nextId injected.
 */
export function runEnemyPhase(cb: any, cc: any, entries: any[], advancePastPlayer: boolean, deps: CombatDeps) {
  const nc = { ...cc, buffs: [...(cc.buffs || [])] };
  nc.ac = computeAC(nc); // include current buffs (Haste, Shield of Faith, Slow, …)
  const enemyHasAdv = nc.conditions.some((k: string) => ENEMY_ADV_CONDS.includes(k));
  const aliveEnemies = cb.enemies.filter((e: any) => e.hpNow > 0);
  if (cb.uncannyUsed === undefined) cb.uncannyUsed = false;
  const advance = () => {
    const before = getCombatView(cb.bridge).round;
    cb.bridge = endTurn(cb.bridge).state;
    if (getCombatView(cb.bridge).round > before) cb.uncannyUsed = false;
  };
  if (advancePastPlayer) advance();
  const aiDeps: EnemyAIDeps = {
    attackMod, rollD20, rollFormula, hitEnemy, enemyHasAttackDisadv,
    exhaustionPenalty, saveMod, hasFeature, hasConcentration,
    getActiveConcentrationBuff, gridDistance,
    entrySystem: deps.entrySystem, nextId: deps.nextId,
  };
  const maxIter = getCombatView(cb.bridge).order.length * 2 + 2;
  for (let i = 0; i < maxIter; i++) {
    const view = getCombatView(cb.bridge);
    const currentId = view.currentCombatantId;
    const idx = view.order.findIndex((o: any) => o.id === currentId);
    cb.currentInitIdx = idx; // derive UI's current-turn index from the bridge pointer
    const cur = view.order[idx];
    if (!cur || cur.isPlayer) break; // yield to the interactive UI
    const e = cb.enemies.find((x: any) => x.uid === currentId);
    if (e && e.hpNow > 0) {
      const res = runEnemyTurn(aiDeps, e, cb, cc, nc, entries, aliveEnemies, enemyHasAdv, cb.uncannyUsed);
      cb.uncannyUsed = res.uncannyUsed;
      if (res.stop) break; // player dropped to 0 HP — stop the enemy phase
    }
    advance();
    if (cb.enemies.filter((x: any) => x.hpNow > 0).length === 0) break; // all enemies dead
  }
  return nc;
}

/**
 * Apply feature-triggered pending changes (conditions, damage, heal, Savage
 * Attacker reroll) to the character/combat clones, emitting the matching EventBus
 * signals. Returns the updated { cc, cb }. Extracted verbatim; logs via pushEntry.
 */
export function applyPendingChanges(
  changes: PendingStateChange[], cc: any, cb: any, pushEntry: (t: string) => void,
): { cc: any; cb: any } {
  let nc = cc;
  let ncb = cb;
  for (const change of changes) {
    if (change.payload.narration) pushEntry(`✨ ${change.payload.narration}`);
    switch (change.type) {
      case "apply_condition": {
        const cid = change.payload.conditionId!;
        const dur = change.payload.conditionDuration || 1;
        if (change.targetId === "player" || change.targetId === nc.id) {
          if (!nc.conditions.includes(cid)) {
            nc = { ...nc, conditions: [...nc.conditions, cid] };
            pushEntry(`   → ติดสภาวะ ${cid} (${dur} รอบ) — จาก ${change.sourceFeature}`);
          }
        } else {
          ncb = { ...ncb, enemies: ncb.enemies.map((e: any) => {
            if (e.uid === change.targetId) {
              const conds = e.conditions || [];
              if (!conds.includes(cid)) {
                pushEntry(`   → ${e.th} ติดสภาวะ ${cid} — จาก ${change.sourceFeature}`);
                return { ...e, conditions: [...conds, cid] };
              }
            }
            return e;
          })};
        }
        emitConditionApplied(change.targetId, cid, change.sourceFeature);
        break;
      }
      case "deal_damage": {
        const dmg = change.payload.damageFormula ? rollFormula(change.payload.damageFormula).total : 0;
        if (dmg > 0) {
          let newBridge = ncb.bridge;
          const newEnemies = ncb.enemies.map((e: any) => {
            if (e.uid === change.targetId) {
              const dd = applyEnemyDamage(newBridge, e.uid, dmg, e.hpNow, e.ac, e.th);
              newBridge = dd.bridge;
              pushEntry(`   → ${e.th} โดน ${dmg} ${change.payload.damageType || ""} (${change.sourceFeature}) → ${dd.hp} HP`);
              return { ...e, hpNow: dd.hp };
            }
            return e;
          });
          ncb = { ...ncb, enemies: newEnemies, bridge: newBridge };
          emitDamageDealt("player", change.targetId, dmg, change.payload.damageType);
        }
        break;
      }
      case "heal": {
        const heal = change.payload.healFormula ? rollFormula(change.payload.healFormula).total : 0;
        if (heal > 0 && (change.targetId === "player" || change.targetId === nc.id)) {
          nc = { ...nc, hp: Math.min(nc.maxHp, nc.hp + heal) };
          pushEntry(`   → ฟื้น ${heal} HP (${change.sourceFeature})`);
          emitHeal("player", change.targetId, heal);
        }
        break;
      }
      case "narrate":
        break;
      case "reroll_damage": {
        // Savage Attacker (D&D 2024) — reroll weapon damage dice, keep the higher total.
        const lastRoll = (cb as any)._lastWeaponDamageRoll;
        let rerollTotal: number;
        let rerollFormula: string;
        if (lastRoll && lastRoll.formula) {
          const reroll = rollFormula(lastRoll.formula);
          rerollTotal = reroll.total;
          rerollFormula = lastRoll.formula;
          if (rerollTotal > lastRoll.total) {
            const bonusDmg = rerollTotal - lastRoll.total;
            let newBridge = ncb.bridge;
            const newEnemies = ncb.enemies.map((e: any) => {
              if (e.uid === change.targetId) {
                const dd = applyEnemyDamage(newBridge, e.uid, bonusDmg, e.hpNow, e.ac, e.th);
                newBridge = dd.bridge;
                pushEntry(`   ⚔️ ${change.sourceFeature}: reroll ${rerollFormula}=${rerollTotal} > ${lastRoll.total} → +${bonusDmg} → ${dd.hp} HP`);
                return { ...e, hpNow: dd.hp };
              }
              return e;
            });
            ncb = { ...ncb, enemies: newEnemies, bridge: newBridge };
            emitDamageDealt("player", change.targetId, bonusDmg, lastRoll.damageType || "slashing");
          } else {
            pushEntry(`   ⚔️ ${change.sourceFeature}: reroll ${rerollFormula}=${rerollTotal} ≤ ${lastRoll.total} → keep original`);
          }
          (cb as any)._lastWeaponDamageRoll = null; // consume the tracked roll (once per turn)
        } else {
          pushEntry(`   ⚔️ ${change.sourceFeature}: no weapon damage to reroll`);
        }
        break;
      }
    }
  }
  return { cc: nc, cb: ncb };
}

/**
 * Resolve one death saving throw and fold the result onto the character.
 * 3 successes = stable, 3 failures = dead, nat-20 = revive at 1 HP, nat-1 = 2
 * failures (engine.combat.applyDeathSaveRoll owns the rule). Pushes a roll entry +
 * a status line into `entries`; on death, calls deps.onDeath(). Extracted verbatim.
 */
export function resolveDeathSave(
  cc: any, entries: any[], inCombat: boolean, deps: CombatDeps,
): { cc: any; state: "unconscious" | "stable" | "dead" | "revived" } {
  const r = rollD20(0);
  const prev = { successes: cc.deathSaves.s, failures: cc.deathSaves.f, hp: cc.hp };
  const result = applyDeathSaveRoll(prev, r.die);
  const dsr = result.rollResult;
  const nc = { ...cc, hp: result.hp, deathSaves: { s: result.deathSaves.successes, f: result.deathSaves.failures }, dead: result.dead };

  if (dsr.state === "revived") { entries.push({ id: deps.nextId(), type: "roll", title: "Death Save", roll: r, success: true, extra: "Nat 20! Revived with 1 HP" }); }
  else if (dsr.successes > prev.successes) { entries.push({ id: deps.nextId(), type: "roll", title: "Death Save", roll: r, dc: 10, success: true, extra: `Success ${dsr.successes}/3` }); }
  else { entries.push({ id: deps.nextId(), type: "roll", title: "Death Save", roll: r, dc: 10, success: false, extra: `Failure ${dsr.failures}/3` }); }

  if (result.state === "dead") {
    entries.push(deps.entrySystem(`☠️ ${nc.name} เสียชีวิต...`));
    deps.onDeath?.();
    return { cc: nc, state: "dead" };
  }
  if (result.state === "stable") {
    entries.push(deps.entrySystem(inCombat ? "อาการคงที่ — ศัตรูทิ้งคุณไว้และจากไป" : "อาการคงที่ — รอดชีวิตอย่างหวุดหวิด"));
  }
  return { cc: nc, state: result.state };
}

/**
 * Run a companion's assist during the enemy phase: pick a living target (the
 * player-selected one if still alive, else the first), roll its attacks, and apply
 * damage through the enemy-HP bridge. Offensive assists only. Logs via pushEntry;
 * `targetId` is the player's current combat target (injected, was component state).
 */
export function runSidekickAssist(cb: any, cc: any, pushEntry: (t: string) => void, targetId?: string | null) {
  const sk = cc?.sidekick;
  if (!sk || !cb || !Array.isArray(cb.enemies)) return;
  const base = SIDEKICK_BASES[sk.baseKey];
  if (!base) return;
  const living = cb.enemies.filter((e: any) => e.hpNow > 0);
  if (living.length === 0) return;
  const block = buildSidekick(base, sk.klass, Math.max(1, Math.min(10, sk.level || cc.level || 1)));
  const intent = sidekickTurnIntent(block, {
    selfHpFraction: 1, // untracked HP → treat as healthy (assist-only)
    woundedAllyHpFraction: cc.maxHp > 0 ? cc.hp / cc.maxHp : null,
    enemyInReach: true,
    hasSpellSlot: !!block.spellcasting,
    canHeal: false, // this light wiring only performs offensive assists
  });
  if (intent.action !== "attack" && intent.action !== "cast_attack") {
    pushEntry(`🐕 ${base.name}: ${intent.reason}`);
    return;
  }
  const target = living.find((e: any) => e.uid === targetId) || living[0];
  for (let i = 0; i < block.attacksPerAction; i++) {
    if (target.hpNow <= 0) break;
    const d20 = d(20);
    const res = resolveSidekickAttack(block, {
      targetAc: target.ac,
      d20,
      damageDiceTotal: rollFormula(block.attack.damageDice).total,
      critDiceTotal: rollFormula(block.attack.damageDice).total,
    });
    if (res.hit) {
      hitEnemy(cb, target, res.damage);
      pushEntry(`🐕 ${base.name} ${intent.action === "cast_attack" ? "ร่ายเวทใส่" : "โจมตี"} ${target.th}: ${res.crit ? "CRIT! " : ""}${res.damage} dmg → ${target.hpNow <= 0 ? "ล้ม!" : `${target.hpNow} HP`}`);
    } else {
      pushEntry(`🐕 ${base.name} โจมตี ${target.th} พลาด (d20=${d20})`);
    }
  }
}
