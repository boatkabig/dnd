/**
 * Vision & Senses System — การมองเห็นและประสาทสัมผัส (18.1–18.8)
 */

import { mod } from "./gameData";
import type { LightLevel } from "./environment";

/* ======================================================================
 * 18.1 VISION TYPE
 * ====================================================================== */

export type VisionType = "normal" | "darkvision" | "blindsight" | "tremorsense" | "truesight";

export interface VisionCapability {
  type: VisionType;
  range: number;        // ft (darkvision 60, blindsight 10, truesight 120, tremorsense 30)
  nameTh: string;
  descTh: string;
}

export const VISION_TYPES: Record<VisionType, VisionCapability> = {
  normal:      { type: "normal",      range: 0,   nameTh: "การมองเห็นปกติ", descTh: "มองเห็นในแสงสว่างเท่านั้น" },
  darkvision:  { type: "darkvision",  range: 60,  nameTh: "Darkvision", descTh: "มองเห็นในความมืดเป็นสีเทา ระยะ 60 ฟุต" },
  blindsight:  { type: "blindsight",  range: 10,  nameTh: "Blindsight", descTh: "รับรู้โดยไม่ต้องใช้สายตา ระยะ 10 ฟุต" },
  tremorsense: { type: "tremorsense", range: 30,  nameTh: "Tremorsense", descTh: "รับรู้การสั่นสะเทือน ระยะ 30 ฟุต" },
  truesight:   { type: "truesight",   range: 120, nameTh: "Truesight", descTh: "มองเห็นทุกอย่างในรูปแบบเดิม รวมถึงล่องหน ภูมิประเทศเวท ระยะ 120 ฟุต" },
};

/* ======================================================================
 * 18.2 LIGHT DETECTION — can creature see in this light?
 * ====================================================================== */

export function canSeeInLight(visions: VisionType[], light: LightLevel): boolean {
  // Truesight and Blindsight ignore all lighting
  if (visions.includes("truesight") || visions.includes("blindsight")) return true;
  // Magical darkness — only Truesight or Blindsight can see
  if (light === "magical_darkness") return visions.includes("truesight") || visions.includes("blindsight");
  // Bright light — everyone sees
  if (light === "bright") return true;
  // Dim light — normal vision has disadvantage, darkvision sees fine
  if (light === "dim") return true; // can still see, just disadvantage for normal
  // Darkness — need darkvision or better
  if (light === "darkness") return visions.includes("darkvision") || visions.includes("truesight") || visions.includes("blindsight") || visions.includes("tremorsense");
  return true;
}

/* ======================================================================
 * 18.3 LINE OF SIGHT
 * ====================================================================== */

export function hasLineOfSight(
  from: { x: number; y: number },
  to: { x: number; y: number },
  walls: { x: number; y: number }[],
  totalCoverObjects: { x: number; y: number }[] = [],
): { hasLOS: boolean; blockedBy?: { x: number; y: number } } {
  // Bresenham line algorithm to check for walls between two points
  let x0 = from.x, y0 = from.y;
  const x1 = to.x, y1 = to.y;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (x0 === x1 && y0 === y1) break;
    // Skip start and end points
    if (!(x0 === from.x && y0 === from.y)) {
      // Check walls
      if (walls.some((w) => w.x === x0 && w.y === y0)) {
        return { hasLOS: false, blockedBy: { x: x0, y: y0 } };
      }
      // Total cover objects block LOS
      if (totalCoverObjects.some((o) => o.x === x0 && o.y === y0)) {
        return { hasLOS: false, blockedBy: { x: x0, y: y0 } };
      }
    }
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return { hasLOS: true };
}

/* ======================================================================
 * 18.4 VISIBILITY STATE
 * ====================================================================== */

export type VisibilityState = "visible" | "hidden" | "invisible" | "obscured" | "fully_concealed";

export function getVisibility(
  targetConditions: string[],
  targetHidden: boolean,
  light: LightLevel,
  viewerVisions: VisionType[],
  hasLOS: boolean,
): VisibilityState {
  // Invisible condition
  if (targetConditions.includes("invisible")) {
    if (viewerVisions.includes("truesight") || viewerVisions.includes("blindsight")) return "visible";
    return "invisible";
  }
  // No line of sight
  if (!hasLOS) return "fully_concealed";
  // Hidden (Stealth)
  if (targetHidden) return "hidden";
  // Can't see in this light
  if (!canSeeInLight(viewerVisions, light)) return "obscured";
  return "visible";
}

/* ======================================================================
 * 18.5 HEARING
 * ====================================================================== */

export interface SoundEvent {
  source: { x: number; y: number };
  volume: number;        // 0-100 (whisper=5, normal=20, shout=50, explosion=100)
  descriptionTh: string;
}

export function canHearSound(
  listenerPos: { x: number; y: number },
  sound: SoundEvent,
  listenerWisMod: number = 0,
): { heard: boolean; distance: number } {
  const distance = Math.abs(listenerPos.x - sound.source.x) + Math.abs(listenerPos.y - sound.source.y);
  // Each square = 5 ft; sound volume drops over distance
  // Simplified: volume - distance * 2 + WIS mod * 5 ≥ 0 → heard
  const effectiveVolume = sound.volume - distance * 2 + listenerWisMod * 5;
  return { heard: effectiveVolume > 0, distance: distance * 5 }; // distance in ft
}

/* ======================================================================
 * 18.6 SMELL
 * ====================================================================== */

export interface ScentEvent {
  source: { x: number; y: number };
  intensity: number;     // 0-10
  descriptionTh: string;
}

/* ======================================================================
 * 18.7 PASSIVE PERCEPTION
 * ====================================================================== */

export function passivePerception(wisScore: number, proficient: boolean = false, charLevel: number = 1, expertise: boolean = false): number {
  const wisMod = mod(wisScore);
  let prof = 0;
  if (proficient) prof = Math.ceil(charLevel / 4) + 1;
  if (expertise) prof *= 2;
  return 10 + wisMod + prof;
}

/* ======================================================================
 * 18.8 DETECTION RULES
 * ====================================================================== */

export interface DetectionResult {
  detected: boolean;
  method: "passive" | "active" | "special";
  roll?: number;
  dc: number;
  descriptionTh: string;
}

export function detectWithPassive(
  passiveScore: number,
  stealthRoll: number,
): DetectionResult {
  return {
    detected: passiveScore >= stealthRoll,
    method: "passive",
    dc: stealthRoll,
    descriptionTh: passiveScore >= stealthRoll
      ? `Passive Perception ${passiveScore} ≥ Stealth ${stealthRoll} → ตรวจพบ!`
      : `Passive Perception ${passiveScore} < Stealth ${stealthRoll} → ไม่พบ`,
  };
}

export function detectWithActive(
  perceptionRoll: number,
  stealthRoll: number,
  dc: number,
): DetectionResult {
  return {
    detected: perceptionRoll >= stealthRoll,
    method: "active",
    roll: perceptionRoll,
    dc,
    descriptionTh: perceptionRoll >= stealthRoll
      ? `Perception ${perceptionRoll} ≥ Stealth ${stealthRoll} → ตรวจพบ!`
      : `Perception ${perceptionRoll} < Stealth ${stealthRoll} → ไม่พบ`,
  };
}

export function detectWithSpecialSense(
  senseRange: number,
  distance: number,
  senseType: VisionType,
): DetectionResult {
  const detected = distance <= senseRange;
  return {
    detected,
    method: "special",
    dc: senseRange,
    descriptionTh: detected
      ? `${senseType} ระยะ ${senseRange} ฟุต ≥ ระยะ ${distance} ฟุต → ตรวจพบ!`
      : `${senseType} ระยะ ${senseRange} ฟุต < ระยะ ${distance} ฟุต → ไม่พบ`,
  };
}
