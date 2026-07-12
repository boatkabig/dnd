"use client";

/**
 * Combat math — extracted from DnDSolo.tsx (de-monolith refactor).
 *
 * Enemy-HP damage seam and grid geometry, none touching component state.
 *
 * applyEnemyDamage / hitEnemy: the persistent cb.bridge (a CombatBridgeState) is
 * the SINGLE owner of enemy HP; every damage site routes its already-final amount
 * through the engine and reads back the projected hpNow. Even the no-bridge
 * fallback derives newHP through a throwaway one-combatant bridge, so there is
 * exactly ONE source of truth — HP is never computed inline.
 *
 * gridDistance / isAdjacent: Chebyshev distance on the 5-ft tactical grid.
 * Moved verbatim — no behavior change.
 */
import { applyBridgeDamage, buildBridgeState } from "./engine/combatBridge";

export function applyEnemyDamage(
  bridge: any,
  uid: string,
  amount: number,
  fallbackHp: number,
  fallbackAc: number = 10,
  fallbackName: string = "",
): { bridge: any; hp: number } {
  if (bridge) {
    const r = applyBridgeDamage(bridge, uid, amount);
    if (r.found) return { bridge: r.state, hp: r.newHP };
  }
  // Degraded path (no persistent bridge / enemy absent): derive via a throwaway
  // engine bridge so the value is still bridge-computed, never inline arithmetic.
  const tmp = buildBridgeState([{ id: uid, name: fallbackName, ac: fallbackAc, hp: fallbackHp, maxHp: fallbackHp, isPlayer: false }]);
  const rr = applyBridgeDamage(tmp, uid, amount);
  return { bridge, hp: rr.newHP };
}

/** Mutating convenience: apply damage to `target` via `cbLike.bridge`, sync the
 *  projected `hpNow`, and return the new HP. The ONLY place `hpNow` is assigned. */
export function hitEnemy(cbLike: any, target: any, amount: number): number {
  const dd = applyEnemyDamage(cbLike?.bridge, target.uid, amount, target.hpNow, target.ac, target.th);
  if (cbLike) cbLike.bridge = dd.bridge;
  target.hpNow = dd.hp;
  return dd.hp;
}

export function gridDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
// Check if target is adjacent (within 1 square = melee range)
export function isAdjacent(posA: { x: number; y: number }, posB: { x: number; y: number }): boolean {
  return gridDistance(posA, posB) <= 1;
}

