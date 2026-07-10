/**
 * Objects System — สิ่งของในฉากที่โต้ตอบได้ (15.1–15.7)
 *
 * Objects = สิ่งของในโลกที่ไม่ใช่ Item ของตัวละคร (ประตู, หีบ, กำแพง, คันโยก)
 * แยกจาก Equipment, Items, Inventory
 */

/* ======================================================================
 * 15.1 OBJECT TYPE
 * ====================================================================== */

export type SceneObjectType =
  | "door" | "container" | "structure" | "furniture"
  | "mechanism" | "trap" | "decoration" | "lever" | "bridge" | "wall";

export const OBJECT_TYPE_TH: Record<SceneObjectType, string> = {
  door: "ประตู", container: "หีบ/กล่อง", structure: "สิ่งปลูกสร้าง",
  furniture: "เฟอร์นิเจอร์", mechanism: "กลไก", trap: "กับดัก",
  decoration: "ของตกแต่ง", lever: "คันโยก", bridge: "สะพาน", wall: "กำแพง",
};

/* ======================================================================
 * 15.2 OBJECT PROPERTIES
 * ====================================================================== */

export interface SceneObject {
  id: string;
  name: string;
  nameTh: string;
  type: SceneObjectType;
  pos: { x: number; y: number };
  size: "small" | "medium" | "large" | "huge";
  material: string;
  description: string;
  descriptionTh: string;
  // 15.3 State
  state: ObjectState;
  // 15.5 Durability
  hp?: number;
  maxHp?: number;
  ac?: number;
  damageResistance?: string[];
  breakThreshold?: number;
  // 15.6 Skill Check
  skillCheck?: {
    skill: string;          // "investigation", "thieves_tools", "athletics"
    dc: number;
    successAction: string;
    successActionTh: string;
    failureAction?: string;
    failureActionTh?: string;
  };
  // 15.7 Trigger
  triggers?: ObjectTrigger[];
  // Container loot
  loot?: string[];
  locked?: boolean;
  lockDC?: number;
}

/* ======================================================================
 * 15.3 OBJECT STATE
 * ====================================================================== */

export type ObjectState = "open" | "closed" | "locked" | "broken" | "activated" | "destroyed" | "normal";

/* ======================================================================
 * 15.4 OBJECT INTERACTION
 * ====================================================================== */

export type ObjectInteraction = "open" | "close" | "lock" | "unlock" | "break" | "move" | "search" | "activate" | "examine";

export function canInteractObject(obj: SceneObject, interaction: ObjectInteraction): { allowed: boolean; reasonTh: string } {
  switch (interaction) {
    case "open":
      if (obj.state === "open") return { allowed: false, reasonTh: "เปิดอยู่แล้ว" };
      if (obj.state === "locked") return { allowed: false, reasonTh: "ล็อกอยู่ — ต้องปลดล็อกก่อน" };
      if (obj.state === "broken") return { allowed: false, reasonTh: "พังแล้ว" };
      return { allowed: true, reasonTh: "เปิดได้" };
    case "close":
      if (obj.state !== "open") return { allowed: false, reasonTh: "ยังไม่เปิด" };
      return { allowed: true, reasonTh: "ปิดได้" };
    case "lock":
      if (obj.state === "locked") return { allowed: false, reasonTh: "ล็อกอยู่แล้ว" };
      if (obj.state === "open") return { allowed: false, reasonTh: "ต้องปิดก่อน" };
      return { allowed: true, reasonTh: "ล็อกได้" };
    case "unlock":
      if (obj.state !== "locked") return { allowed: false, reasonTh: "ไม่ได้ล็อกอยู่" };
      return { allowed: true, reasonTh: "ปลดล็อกได้ (ต้องทอย Thieves' Tools หรือมีกุญแจ)" };
    case "break":
      if (obj.state === "broken" || obj.state === "destroyed") return { allowed: false, reasonTh: "พังแล้ว" };
      return { allowed: true, reasonTh: "ทุบได้" };
    case "search":
      return { allowed: true, reasonTh: "ค้นหาได้" };
    case "activate":
      if (obj.state === "activated") return { allowed: false, reasonTh: "ทำงานอยู่แล้ว" };
      return { allowed: true, reasonTh: "สั่งการได้" };
    case "examine":
      return { allowed: true, reasonTh: "ตรวจสอบได้" };
    default:
      return { allowed: true, reasonTh: "ทำได้" };
  }
}

export function interactObject(obj: SceneObject, interaction: ObjectInteraction, checkResult?: number): { success: boolean; newState?: ObjectState; reasonTh: string; loot?: string[]; triggered?: ObjectTrigger[] } {
  const check = canInteractObject(obj, interaction);
  if (!check.allowed) return { success: false, reasonTh: check.reasonTh };

  switch (interaction) {
    case "open":
      obj.state = "open";
      return { success: true, newState: "open", reasonTh: `เปิด ${obj.nameTh} แล้ว`, loot: obj.loot, triggered: obj.triggers };
    case "close":
      obj.state = "closed";
      return { success: true, newState: "closed", reasonTh: `ปิด ${obj.nameTh} แล้ว` };
    case "unlock":
      if (obj.lockDC && checkResult !== undefined) {
        if (checkResult >= obj.lockDC) {
          obj.state = "closed";
          obj.locked = false;
          return { success: true, newState: "closed", reasonTh: `ปลดล็อกสำเร็จ (DC ${obj.lockDC})` };
        }
        return { success: false, reasonTh: `ปลดล็อกไม่สำเร็จ (ทอย ${checkResult} vs DC ${obj.lockDC})` };
      }
      obj.state = "closed";
      obj.locked = false;
      return { success: true, newState: "closed", reasonTh: "ปลดล็อกแล้ว" };
    case "break":
      if (obj.hp !== undefined && obj.maxHp !== undefined) {
        obj.hp = 0;
      }
      obj.state = "broken";
      return { success: true, newState: "broken", reasonTh: `${obj.nameTh} พังแล้ว`, loot: obj.loot };
    case "activate":
      obj.state = "activated";
      return { success: true, newState: "activated", reasonTh: `${obj.nameTh} ทำงาน`, triggered: obj.triggers };
    case "search":
      return { success: true, reasonTh: `ค้นหา ${obj.nameTh}...`, loot: obj.loot };
    case "examine":
      return { success: true, reasonTh: obj.descriptionTh };
    default:
      return { success: true, reasonTh: "ทำสำเร็จ" };
  }
}

/* ======================================================================
 * 15.5 DURABILITY
 * ====================================================================== */

export function damageObject(obj: SceneObject, damage: number, damageType: string = "bludgeoning"): { destroyed: boolean; hpRemaining: number } {
  if (obj.hp === undefined) return { destroyed: false, hpRemaining: 0 };
  // Apply resistance
  let actualDamage = damage;
  if (obj.damageResistance?.includes(damageType)) actualDamage = Math.floor(actualDamage / 2);
  obj.hp = Math.max(0, obj.hp - actualDamage);
  const destroyed = obj.hp <= (obj.breakThreshold || 0);
  if (destroyed) { obj.state = "broken"; if (obj.hp <= 0) obj.state = "destroyed"; }
  return { destroyed, hpRemaining: obj.hp };
}

/* ======================================================================
 * 15.7 TRIGGER
 * ====================================================================== */

export interface ObjectTrigger {
  event: "on_open" | "on_close" | "on_break" | "on_activate" | "on_search" | "on_enter";
  type: "trap" | "spawn" | "message" | "effect" | "reveal" | "lock";
  description: string;
  descriptionTh: string;
  // Trap details
  trapDamage?: string;
  trapDamageType?: string;
  trapSaveDC?: number;
  trapSaveAbility?: string;
  trapSaveSuccess?: "half" | "none";
  // Spawn
  spawnMonster?: string;
  spawnCount?: number;
}

export function checkTriggers(obj: SceneObject, event: ObjectTrigger["event"]): ObjectTrigger[] {
  return (obj.triggers || []).filter((t) => t.event === event);
}

/* ======================================================================
 * FACTORY: common scene objects
 * ====================================================================== */

export function createDoor(id: string, locked: boolean = false, lockDC: number = 15, pos: { x: number; y: number } = { x: 0, y: 0 }): SceneObject {
  return {
    id, name: "Door", nameTh: "ประตู", type: "door", pos, size: "medium",
    material: "wood", description: "A wooden door.", descriptionTh: "ประตูไม้",
    state: locked ? "locked" : "closed",
    hp: 15, maxHp: 15, ac: 15, breakThreshold: 0,
    locked, lockDC: locked ? lockDC : undefined,
    skillCheck: locked ? { skill: "thieves_tools", dc: lockDC, successAction: "unlock", successActionTh: "ปลดล็อกสำเร็จ", failureAction: "jam", failureActionTh: "กลไกติดขัด" } : undefined,
  };
}

export function createChest(id: string, loot: string[] = [], locked: boolean = false, lockDC: number = 12, pos: { x: number; y: number } = { x: 0, y: 0 }): SceneObject {
  return {
    id, name: "Chest", nameTh: "หีบ", type: "container", pos, size: "medium",
    material: "wood", description: "A wooden chest.", descriptionTh: "หีบไม้",
    state: locked ? "locked" : "closed",
    hp: 10, maxHp: 10, ac: 12, breakThreshold: 0,
    locked, lockDC: locked ? lockDC : undefined,
    loot,
    skillCheck: locked ? { skill: "thieves_tools", dc: lockDC, successAction: "unlock", successActionTh: "ปลดล็อกสำเร็จ" } : undefined,
  };
}

export function createTrap(id: string, trapDamage: string = "2d6", trapDamageType: string = "piercing", saveDC: number = 13, pos: { x: number; y: number } = { x: 0, y: 0 }): SceneObject {
  return {
    id, name: "Trap", nameTh: "กับดัก", type: "trap", pos, size: "small",
    material: "metal", description: "A hidden trap.", descriptionTh: "กับดักซ่อนอยู่",
    state: "normal",
    triggers: [{
      event: "on_enter", type: "trap",
      description: `Trap deals ${trapDamage} ${trapDamageType} damage. DC ${saveDC} DEX save for half.`,
      descriptionTh: `กับดักทำดาเมจ ${trapDamage} ${trapDamageType} — DEX save DC ${saveDC} ผ่านลดครึ่ง`,
      trapDamage, trapDamageType, trapSaveDC: saveDC, trapSaveAbility: "dex", trapSaveSuccess: "half",
    }],
  };
}
