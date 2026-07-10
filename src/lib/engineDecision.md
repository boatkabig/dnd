# Engine Architecture Decision (B1/B2)

## Decision: Inline = Canonical Architecture

After review (Round 4), the decision is:
- **Effects/Resources work INLINE in DnDSolo.tsx** — this IS the architecture
- **`archive/lib/effects.ts`, `resources.ts`, `features.ts` are DEAD** — will NOT be revived
- No "engine revival" needed — the inline code is the engine

## What works inline (verified live):
- B1 Effects: Bless (+1d4 atk/save), Bane (-1d4), Hunter's Mark (+1d6 dmg), Hex (+1d6 dmg),
  concentration tracking (CON save on damage), buff duration tick, Shield of Faith (+2 AC),
  Haste (+2 AC), Mage Armor (AC 13+DEX), Shield (+5 AC reaction), Slow (-2 AC), Faerie Fire (adv)
- B2 Resources: Rage (count-limited, recharge long rest), Ki (track/spend, recharge short rest),
  Action Surge (1/short rest), Second Wind (1/short rest), Lay on Hands (pool 5×level),
  Bardic Inspiration (CHA mod/long rest), Sorcery Points (level), Pact Magic (short rest refresh)

## What this means for maintainers:
- Do NOT edit `archive/lib/effects.ts` or `resources.ts` — they don't run
- Edit inline buff/resource logic directly in `DnDSolo.tsx`
- The `archive/` folder is reference-only
