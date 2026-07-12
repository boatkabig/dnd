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
import { rollFormula } from "./characterStats";
import { hitEnemy } from "./combatMath";

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
