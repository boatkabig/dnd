/**
 * ============================================================================
 * CombatView — the combat slice, re-plumbed onto the engine via combatBridge
 * ============================================================================
 *
 * Background (see PROGRESS.md § Problems): the app historically shipped THREE
 * parallel combat implementations; only the buggy inline monolith in
 * DnDSolo.tsx ever ran, while the tested engine sat dead. This module starts
 * paying that down for the player weapon-attack path:
 *
 *   1. `resolveBridgeAttack` — the single mutation seam. Every player weapon
 *      attack's to-hit + base weapon damage now flows through the engine
 *      (`combatBridge.performAttack` → `resolveAttack`), NOT hand-rolled dice
 *      inline. The engine is the source of truth for the roll, crit, cover and
 *      base damage.
 *   2. `CombatEnemyList` — the enemy target picker. Clicking an enemy card
 *      records it as the selected target so the attack lands on the enemy the
 *      player chose (the target-selection bug this task fixes), not always the
 *      first alive enemy.
 *
 * Data-shape note: the app keeps its combat UI state in DnDSolo's `cb` object
 * (enemies as loosely-typed blobs). Rather than maintain a second persistent
 * combat state (the very "parallel implementations" disease we're curing),
 * `resolveBridgeAttack` builds a throwaway two-combatant `CombatBridgeState`
 * per attack, asks the bridge to resolve it, and returns the pure result. The
 * caller applies the returned damage to its own `cb.enemies` — one UI state,
 * one engine math seam.
 */

import React from "react";

// ---------------------------------------------------------------------------
// Enemy target picker (the target-selection UI)
// ---------------------------------------------------------------------------

export interface CombatEnemyListProps {
  enemies: any[];
  /** Currently selected target uid (null = none → attacks fall back to first alive). */
  selectedTargetId: string | null;
  onSelectTarget: (uid: string) => void;
  thinking: boolean;
  downed: boolean;
}

/**
 * Renders the horizontal strip of enemy cards. Clicking a living enemy card
 * selects it as the attack target; the selected card is highlighted. Preserves
 * the legacy `.enemy-card` / `.hpbar-label` markup the e2e net asserts on.
 */
export function CombatEnemyList({
  enemies,
  selectedTargetId,
  onSelectTarget,
  thinking,
  downed,
}: CombatEnemyListProps): React.ReactElement {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
      {enemies.map((e: any) => {
        const alive = e.hpNow > 0;
        const selectable = alive && !thinking && !downed;
        const isSelected = selectedTargetId === e.uid && alive;
        return (
          <div
            key={e.uid}
            className={"enemy-card" + (e.hpNow <= 0 ? " dead" : "") + (isSelected ? " selected" : "")}
            style={{
              cursor: selectable ? "pointer" : "default",
              borderColor: isSelected ? "#E0A83E" : alive ? "#6E3448" : undefined,
              boxShadow: isSelected ? "0 0 8px rgba(224,168,62,0.45)" : undefined,
            }}
            onClick={() => {
              if (selectable) onSelectTarget(e.uid);
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {e.hpNow <= 0 ? "💀 " : ""}
              {isSelected ? "🎯 " : ""}
              {e.th}
            </div>
            <div style={{ fontSize: 11, color: "#8A7F9E" }}>
              AC {e.ac}
              {e.cr ? ` · CR ${e.cr}` : ""}
            </div>
            <div className="hpbar" style={{ height: 12, marginTop: 4 }}>
              <div
                className="hpbar-fill"
                style={{ width: Math.max(0, (e.hpNow / e.hp) * 100) + "%", background: "#C74B44" }}
              />
              <span className="hpbar-label" style={{ fontSize: 9 }}>
                {e.hpNow}/{e.hp}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CombatEnemyList;
