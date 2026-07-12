"use client";

/**
 * Buff lifecycle helpers — extracted from DnDSolo.tsx (de-monolith refactor).
 *
 * Pure, no component state. tickBuffs decrements each timed buff's duration by one
 * round and drops the ones that hit zero (duration 0 = instant/already-applied and
 * -1 = until-long-rest are both kept), surfacing one expiry line per drop through
 * the optional pushEntry callback. applyBuffToCharacter (re)applies a buff by name,
 * replacing any existing same-named buff and setting the Mage Armor AC flag.
 * Moved verbatim — no behavior change (tickBuffs now logs via a callback instead of
 * pushing entrySystem entries directly, so it no longer depends on the component).
 */
export function tickBuffs(cc: any, pushEntry?: (t: string) => void): any {
  const nc = { ...cc, buffs: [...(cc.buffs || [])] };
  const expired: string[] = [];
  nc.buffs = nc.buffs.map((b: any) => ({ ...b })).filter((b: any) => {
    if (b.duration > 0) {
      b.duration -= 1;
      if (b.duration <= 0) { expired.push(b.name); return false; }
    }
    return true; // keep duration === 0 (instant, already applied) and duration === -1 (until long rest)
  });
  expired.forEach((name) => pushEntry?.(`⏳ Buff หมดอายุ: ${name}`));
  return nc;
}

export function applyBuffToCharacter(buff: any, cc: any): any {
  const nc = { ...cc, buffs: [...(cc.buffs || [])] };
  // Remove existing buff with same name
  nc.buffs = nc.buffs.filter((b: any) => b.name !== buff.name);
  nc.buffs.push(buff);
  // Mage Armor — set flag for AC computation
  if (buff.name === "Mage Armor") nc.mageArmor = true;
  return nc;
}
