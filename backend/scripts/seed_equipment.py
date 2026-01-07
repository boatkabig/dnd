"""Seed script for D&D 5e Equipment Master Data.

Run with: uv run python scripts/seed_equipment.py

Contains comprehensive D&D 5e SRD equipment data including:
- Simple & Martial Weapons (Melee & Ranged)
- Light, Medium & Heavy Armor
- Adventuring Gear
- Tools (Artisan's, Gaming, Musical, etc.)
- Mounts & Vehicles
"""

import asyncio
from sqlalchemy import select
from src.db import async_session_maker
from src.models import SRDEquipment, SRDDamageType, DAMAGE_TYPES

# ============== WEAPONS ==============

SIMPLE_MELEE_WEAPONS = [
    {
        "equipment_id": "club",
        "category": "weapon",
        "subcategory": "simple_melee",
        "weight": 2.0,
        "cost_gp": 0.1,  # 1 SP
        "properties": {
            "damage": "1d4",
            "damage_type": "bludgeoning",
            "properties": ["light"],
            "mastery": "slow"
        }
    },
    {
        "equipment_id": "dagger",
        "category": "weapon",
        "subcategory": "simple_melee",
        "weight": 1.0,
        "cost_gp": 2.0,
        "properties": {
            "damage": "1d4",
            "damage_type": "piercing",
            "properties": ["finesse", "light", "thrown"],
            "range": "20/60",
            "mastery": "nick"
        }
    },
    {
        "equipment_id": "greatclub",
        "category": "weapon",
        "subcategory": "simple_melee",
        "weight": 10.0,
        "cost_gp": 0.2,  # 2 SP
        "properties": {
            "damage": "1d8",
            "damage_type": "bludgeoning",
            "properties": ["two-handed"],
            "mastery": "push"
        }
    },
    {
        "equipment_id": "handaxe",
        "category": "weapon",
        "subcategory": "simple_melee",
        "weight": 2.0,
        "cost_gp": 5.0,
        "properties": {
            "damage": "1d6",
            "damage_type": "slashing",
            "properties": ["light", "thrown"],
            "range": "20/60",
            "mastery": "vex"
        }
    },
    {
        "equipment_id": "javelin",
        "category": "weapon",
        "subcategory": "simple_melee",
        "weight": 2.0,
        "cost_gp": 0.5,  # 5 SP
        "properties": {
            "damage": "1d6",
            "damage_type": "piercing",
            "properties": ["thrown"],
            "range": "30/120",
            "mastery": "slow"
        }
    },
    {
        "equipment_id": "light_hammer",
        "category": "weapon",
        "subcategory": "simple_melee",
        "weight": 2.0,
        "cost_gp": 2.0,
        "properties": {
            "damage": "1d4",
            "damage_type": "bludgeoning",
            "properties": ["light", "thrown"],
            "range": "20/60",
            "mastery": "nick"
        }
    },
    {
        "equipment_id": "mace",
        "category": "weapon",
        "subcategory": "simple_melee",
        "weight": 4.0,
        "cost_gp": 5.0,
        "properties": {
            "damage": "1d6",
            "damage_type": "bludgeoning",
            "properties": [],
            "mastery": "sap"
        }
    },
    {
        "equipment_id": "quarterstaff",
        "category": "weapon",
        "subcategory": "simple_melee",
        "weight": 4.0,
        "cost_gp": 0.2,  # 2 SP
        "properties": {
            "damage": "1d6",
            "damage_type": "bludgeoning",
            "properties": ["versatile"],
            "versatile_damage": "1d8",
            "mastery": "topple"
        }
    },
    {
        "equipment_id": "sickle",
        "category": "weapon",
        "subcategory": "simple_melee",
        "weight": 2.0,
        "cost_gp": 1.0,
        "properties": {
            "damage": "1d4",
            "damage_type": "slashing",
            "properties": ["light"],
            "mastery": "nick"
        }
    },
    {
        "equipment_id": "spear",
        "category": "weapon",
        "subcategory": "simple_melee",
        "weight": 3.0,
        "cost_gp": 1.0,
        "properties": {
            "damage": "1d6",
            "damage_type": "piercing",
            "properties": ["thrown", "versatile"],
            "range": "20/60",
            "versatile_damage": "1d8",
            "mastery": "sap"
        }
    },
]

SIMPLE_RANGED_WEAPONS = [
    {
        "equipment_id": "dart",
        "category": "weapon",
        "subcategory": "simple_ranged",
        "weight": 0.25,
        "cost_gp": 0.05,  # 5 CP
        "properties": {
            "damage": "1d4",
            "damage_type": "piercing",
            "properties": ["finesse", "thrown"],
            "range": "20/60",
            "mastery": "vex"
        }
    },
    {
        "equipment_id": "light_crossbow",
        "category": "weapon",
        "subcategory": "simple_ranged",
        "weight": 5.0,
        "cost_gp": 25.0,
        "properties": {
            "damage": "1d8",
            "damage_type": "piercing",
            "properties": ["ammunition", "loading", "two-handed"],
            "range": "80/320",
            "ammunition_type": "bolt",
            "mastery": "slow"
        }
    },
    {
        "equipment_id": "shortbow",
        "category": "weapon",
        "subcategory": "simple_ranged",
        "weight": 2.0,
        "cost_gp": 25.0,
        "properties": {
            "damage": "1d6",
            "damage_type": "piercing",
            "properties": ["ammunition", "two-handed"],
            "range": "80/320",
            "ammunition_type": "arrow",
            "mastery": "vex"
        }
    },
    {
        "equipment_id": "sling",
        "category": "weapon",
        "subcategory": "simple_ranged",
        "weight": 0.0,
        "cost_gp": 0.1,  # 1 SP
        "properties": {
            "damage": "1d4",
            "damage_type": "bludgeoning",
            "properties": ["ammunition"],
            "range": "30/120",
            "ammunition_type": "bullet",
            "mastery": "slow"
        }
    },
]

MARTIAL_MELEE_WEAPONS = [
    {
        "equipment_id": "battleaxe",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 4.0,
        "cost_gp": 10.0,
        "properties": {
            "damage": "1d8",
            "damage_type": "slashing",
            "properties": ["versatile"],
            "versatile_damage": "1d10",
            "mastery": "topple"
        }
    },
    {
        "equipment_id": "flail",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 2.0,
        "cost_gp": 10.0,
        "properties": {
            "damage": "1d8",
            "damage_type": "bludgeoning",
            "properties": [],
            "mastery": "sap"
        }
    },
    {
        "equipment_id": "glaive",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 6.0,
        "cost_gp": 20.0,
        "properties": {
            "damage": "1d10",
            "damage_type": "slashing",
            "properties": ["heavy", "reach", "two-handed"],
            "mastery": "graze"
        }
    },
    {
        "equipment_id": "greataxe",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 7.0,
        "cost_gp": 30.0,
        "properties": {
            "damage": "1d12",
            "damage_type": "slashing",
            "properties": ["heavy", "two-handed"],
            "mastery": "cleave"
        }
    },
    {
        "equipment_id": "greatsword",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 6.0,
        "cost_gp": 50.0,
        "properties": {
            "damage": "2d6",
            "damage_type": "slashing",
            "properties": ["heavy", "two-handed"],
            "mastery": "graze"
        }
    },
    {
        "equipment_id": "halberd",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 6.0,
        "cost_gp": 20.0,
        "properties": {
            "damage": "1d10",
            "damage_type": "slashing",
            "properties": ["heavy", "reach", "two-handed"],
            "mastery": "cleave"
        }
    },
    {
        "equipment_id": "lance",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 6.0,
        "cost_gp": 10.0,
        "properties": {
            "damage": "1d10",
            "damage_type": "piercing",
            "properties": ["heavy", "reach", "two-handed"],
            "special": "one-handed when mounted",
            "mastery": "topple"
        }
    },
    {
        "equipment_id": "longsword",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 3.0,
        "cost_gp": 15.0,
        "properties": {
            "damage": "1d8",
            "damage_type": "slashing",
            "properties": ["versatile"],
            "versatile_damage": "1d10",
            "mastery": "sap"
        }
    },
    {
        "equipment_id": "maul",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 10.0,
        "cost_gp": 10.0,
        "properties": {
            "damage": "2d6",
            "damage_type": "bludgeoning",
            "properties": ["heavy", "two-handed"],
            "mastery": "topple"
        }
    },
    {
        "equipment_id": "morningstar",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 4.0,
        "cost_gp": 15.0,
        "properties": {
            "damage": "1d8",
            "damage_type": "piercing",
            "properties": [],
            "mastery": "sap"
        }
    },
    {
        "equipment_id": "pike",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 18.0,
        "cost_gp": 5.0,
        "properties": {
            "damage": "1d10",
            "damage_type": "piercing",
            "properties": ["heavy", "reach", "two-handed"],
            "mastery": "push"
        }
    },
    {
        "equipment_id": "rapier",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 2.0,
        "cost_gp": 25.0,
        "properties": {
            "damage": "1d8",
            "damage_type": "piercing",
            "properties": ["finesse"],
            "mastery": "vex"
        }
    },
    {
        "equipment_id": "scimitar",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 3.0,
        "cost_gp": 25.0,
        "properties": {
            "damage": "1d6",
            "damage_type": "slashing",
            "properties": ["finesse", "light"],
            "mastery": "nick"
        }
    },
    {
        "equipment_id": "shortsword",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 2.0,
        "cost_gp": 10.0,
        "properties": {
            "damage": "1d6",
            "damage_type": "piercing",
            "properties": ["finesse", "light"],
            "mastery": "vex"
        }
    },
    {
        "equipment_id": "trident",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 4.0,
        "cost_gp": 5.0,
        "properties": {
            "damage": "1d8",
            "damage_type": "piercing",
            "properties": ["thrown", "versatile"],
            "range": "20/60",
            "versatile_damage": "1d10",
            "mastery": "topple"
        }
    },
    {
        "equipment_id": "warhammer",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 5.0,
        "cost_gp": 15.0,
        "properties": {
            "damage": "1d8",
            "damage_type": "bludgeoning",
            "properties": ["versatile"],
            "versatile_damage": "1d10",
            "mastery": "push"
        }
    },
    {
        "equipment_id": "war_pick",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 2.0,
        "cost_gp": 5.0,
        "properties": {
            "damage": "1d8",
            "damage_type": "piercing",
            "properties": ["versatile"],
            "versatile_damage": "1d10",
            "mastery": "sap"
        }
    },
    {
        "equipment_id": "whip",
        "category": "weapon",
        "subcategory": "martial_melee",
        "weight": 3.0,
        "cost_gp": 2.0,
        "properties": {
            "damage": "1d4",
            "damage_type": "slashing",
            "properties": ["finesse", "reach"],
            "mastery": "slow"
        }
    },
]

MARTIAL_RANGED_WEAPONS = [
    {
        "equipment_id": "blowgun",
        "category": "weapon",
        "subcategory": "martial_ranged",
        "weight": 1.0,
        "cost_gp": 10.0,
        "properties": {
            "damage": "1",
            "damage_type": "piercing",
            "properties": ["ammunition", "loading"],
            "range": "25/100",
            "ammunition_type": "needle",
            "mastery": "vex"
        }
    },
    {
        "equipment_id": "hand_crossbow",
        "category": "weapon",
        "subcategory": "martial_ranged",
        "weight": 3.0,
        "cost_gp": 75.0,
        "properties": {
            "damage": "1d6",
            "damage_type": "piercing",
            "properties": ["ammunition", "light", "loading"],
            "range": "30/120",
            "ammunition_type": "bolt",
            "mastery": "vex"
        }
    },
    {
        "equipment_id": "heavy_crossbow",
        "category": "weapon",
        "subcategory": "martial_ranged",
        "weight": 18.0,
        "cost_gp": 50.0,
        "properties": {
            "damage": "1d10",
            "damage_type": "piercing",
            "properties": ["ammunition", "heavy", "loading", "two-handed"],
            "range": "100/400",
            "ammunition_type": "bolt",
            "mastery": "push"
        }
    },
    {
        "equipment_id": "longbow",
        "category": "weapon",
        "subcategory": "martial_ranged",
        "weight": 2.0,
        "cost_gp": 50.0,
        "properties": {
            "damage": "1d8",
            "damage_type": "piercing",
            "properties": ["ammunition", "heavy", "two-handed"],
            "range": "150/600",
            "ammunition_type": "arrow",
            "mastery": "slow"
        }
    },
    {
        "equipment_id": "musket",
        "category": "weapon",
        "subcategory": "martial_ranged",
        "weight": 10.0,
        "cost_gp": 500.0,
        "properties": {
            "damage": "1d12",
            "damage_type": "piercing",
            "properties": ["ammunition", "loading", "two-handed"],
            "range": "40/120",
            "ammunition_type": "bullet",
            "mastery": "slow"
        }
    },
    {
        "equipment_id": "pistol",
        "category": "weapon",
        "subcategory": "martial_ranged",
        "weight": 3.0,
        "cost_gp": 250.0,
        "properties": {
            "damage": "1d10",
            "damage_type": "piercing",
            "properties": ["ammunition", "loading"],
            "range": "30/90",
            "ammunition_type": "bullet",
            "mastery": "vex"
        }
    },
]

# ============== ARMOR ==============

LIGHT_ARMOR = [
    {
        "equipment_id": "padded_armor",
        "category": "armor",
        "subcategory": "light_armor",
        "weight": 8.0,
        "cost_gp": 5.0,
        "properties": {
            "ac": 11,
            "ac_formula": "11 + Dex",
            "stealth_disadvantage": True,
            "don_time": "1 minute",
            "doff_time": "1 minute"
        }
    },
    {
        "equipment_id": "leather_armor",
        "category": "armor",
        "subcategory": "light_armor",
        "weight": 10.0,
        "cost_gp": 10.0,
        "properties": {
            "ac": 11,
            "ac_formula": "11 + Dex",
            "stealth_disadvantage": False,
            "don_time": "1 minute",
            "doff_time": "1 minute"
        }
    },
    {
        "equipment_id": "studded_leather_armor",
        "category": "armor",
        "subcategory": "light_armor",
        "weight": 13.0,
        "cost_gp": 45.0,
        "properties": {
            "ac": 12,
            "ac_formula": "12 + Dex",
            "stealth_disadvantage": False,
            "don_time": "1 minute",
            "doff_time": "1 minute"
        }
    },
]

MEDIUM_ARMOR = [
    {
        "equipment_id": "hide_armor",
        "category": "armor",
        "subcategory": "medium_armor",
        "weight": 12.0,
        "cost_gp": 10.0,
        "properties": {
            "ac": 12,
            "ac_formula": "12 + Dex (max 2)",
            "max_dex_bonus": 2,
            "stealth_disadvantage": False,
            "don_time": "5 minutes",
            "doff_time": "1 minute"
        }
    },
    {
        "equipment_id": "chain_shirt",
        "category": "armor",
        "subcategory": "medium_armor",
        "weight": 20.0,
        "cost_gp": 50.0,
        "properties": {
            "ac": 13,
            "ac_formula": "13 + Dex (max 2)",
            "max_dex_bonus": 2,
            "stealth_disadvantage": False,
            "don_time": "5 minutes",
            "doff_time": "1 minute"
        }
    },
    {
        "equipment_id": "scale_mail",
        "category": "armor",
        "subcategory": "medium_armor",
        "weight": 45.0,
        "cost_gp": 50.0,
        "properties": {
            "ac": 14,
            "ac_formula": "14 + Dex (max 2)",
            "max_dex_bonus": 2,
            "stealth_disadvantage": True,
            "don_time": "5 minutes",
            "doff_time": "1 minute"
        }
    },
    {
        "equipment_id": "breastplate",
        "category": "armor",
        "subcategory": "medium_armor",
        "weight": 20.0,
        "cost_gp": 400.0,
        "properties": {
            "ac": 14,
            "ac_formula": "14 + Dex (max 2)",
            "max_dex_bonus": 2,
            "stealth_disadvantage": False,
            "don_time": "5 minutes",
            "doff_time": "1 minute"
        }
    },
    {
        "equipment_id": "half_plate_armor",
        "category": "armor",
        "subcategory": "medium_armor",
        "weight": 40.0,
        "cost_gp": 750.0,
        "properties": {
            "ac": 15,
            "ac_formula": "15 + Dex (max 2)",
            "max_dex_bonus": 2,
            "stealth_disadvantage": True,
            "don_time": "5 minutes",
            "doff_time": "1 minute"
        }
    },
]

HEAVY_ARMOR = [
    {
        "equipment_id": "ring_mail",
        "category": "armor",
        "subcategory": "heavy_armor",
        "weight": 40.0,
        "cost_gp": 30.0,
        "properties": {
            "ac": 14,
            "ac_formula": "14",
            "strength_required": None,
            "stealth_disadvantage": True,
            "don_time": "10 minutes",
            "doff_time": "5 minutes"
        }
    },
    {
        "equipment_id": "chain_mail",
        "category": "armor",
        "subcategory": "heavy_armor",
        "weight": 55.0,
        "cost_gp": 75.0,
        "properties": {
            "ac": 16,
            "ac_formula": "16",
            "strength_required": 13,
            "stealth_disadvantage": True,
            "don_time": "10 minutes",
            "doff_time": "5 minutes"
        }
    },
    {
        "equipment_id": "splint_armor",
        "category": "armor",
        "subcategory": "heavy_armor",
        "weight": 60.0,
        "cost_gp": 200.0,
        "properties": {
            "ac": 17,
            "ac_formula": "17",
            "strength_required": 15,
            "stealth_disadvantage": True,
            "don_time": "10 minutes",
            "doff_time": "5 minutes"
        }
    },
    {
        "equipment_id": "plate_armor",
        "category": "armor",
        "subcategory": "heavy_armor",
        "weight": 65.0,
        "cost_gp": 1500.0,
        "properties": {
            "ac": 18,
            "ac_formula": "18",
            "strength_required": 15,
            "stealth_disadvantage": True,
            "don_time": "10 minutes",
            "doff_time": "5 minutes"
        }
    },
]

SHIELDS = [
    {
        "equipment_id": "shield",
        "category": "armor",
        "subcategory": "shield",
        "weight": 6.0,
        "cost_gp": 10.0,
        "properties": {
            "ac_bonus": 2,
            "don_time": "utilize action",
            "doff_time": "utilize action"
        }
    },
]

# ============== ADVENTURING GEAR ==============

ADVENTURING_GEAR = [
    {"equipment_id": "acid", "category": "adventuring_gear", "subcategory": "consumable", "weight": 1.0, "cost_gp": 25.0,
     "properties": {"damage": "2d6", "damage_type": "acid", "range": "20", "action": "attack"}},
    {"equipment_id": "alchemists_fire", "category": "adventuring_gear", "subcategory": "consumable", "weight": 1.0, "cost_gp": 50.0,
     "properties": {"damage": "1d4", "damage_type": "fire", "range": "20", "action": "attack", "condition": "burning"}},
    {"equipment_id": "antitoxin", "category": "adventuring_gear", "subcategory": "consumable", "weight": 0.0, "cost_gp": 50.0,
     "properties": {"effect": "advantage vs poison", "duration": "1 hour"}},
    {"equipment_id": "backpack", "category": "adventuring_gear", "subcategory": "container", "weight": 5.0, "cost_gp": 2.0,
     "properties": {"capacity": "30 lbs / 1 cubic foot"}},
    {"equipment_id": "ball_bearings", "category": "adventuring_gear", "subcategory": "utility", "weight": 2.0, "cost_gp": 1.0,
     "properties": {"area": "10 ft square", "dc": 10, "effect": "prone"}},
    {"equipment_id": "barrel", "category": "adventuring_gear", "subcategory": "container", "weight": 70.0, "cost_gp": 2.0,
     "properties": {"capacity": "40 gallons / 4 cubic feet"}},
    {"equipment_id": "bedroll", "category": "adventuring_gear", "subcategory": "camping", "weight": 7.0, "cost_gp": 1.0,
     "properties": {"effect": "auto-pass cold save"}},
    {"equipment_id": "bell", "category": "adventuring_gear", "subcategory": "utility", "weight": 0.0, "cost_gp": 1.0,
     "properties": {"range": "60 ft audible"}},
    {"equipment_id": "blanket", "category": "adventuring_gear", "subcategory": "camping", "weight": 3.0, "cost_gp": 0.5,
     "properties": {"effect": "advantage vs cold"}},
    {"equipment_id": "caltrops", "category": "adventuring_gear", "subcategory": "utility", "weight": 2.0, "cost_gp": 1.0,
     "properties": {"area": "5 ft square", "dc": 15, "damage": "1", "effect": "speed 0"}},
    {"equipment_id": "candle", "category": "adventuring_gear", "subcategory": "light", "weight": 0.0, "cost_gp": 0.01,
     "properties": {"duration": "1 hour", "bright_light": "5 ft", "dim_light": "10 ft"}},
    {"equipment_id": "chain", "category": "adventuring_gear", "subcategory": "utility", "weight": 10.0, "cost_gp": 5.0,
     "properties": {"length": "10 ft", "break_dc": 20}},
    {"equipment_id": "chest", "category": "adventuring_gear", "subcategory": "container", "weight": 25.0, "cost_gp": 5.0,
     "properties": {"capacity": "12 cubic feet"}},
    {"equipment_id": "climbers_kit", "category": "adventuring_gear", "subcategory": "utility", "weight": 12.0, "cost_gp": 25.0,
     "properties": {"effect": "anchor, max fall 25 ft"}},
    {"equipment_id": "crowbar", "category": "adventuring_gear", "subcategory": "utility", "weight": 5.0, "cost_gp": 2.0,
     "properties": {"effect": "advantage on Strength checks"}},
    {"equipment_id": "grappling_hook", "category": "adventuring_gear", "subcategory": "utility", "weight": 4.0, "cost_gp": 2.0,
     "properties": {"range": "50 ft", "dc": 13, "skill": "acrobatics"}},
    {"equipment_id": "healers_kit", "category": "adventuring_gear", "subcategory": "medical", "weight": 3.0, "cost_gp": 5.0,
     "properties": {"uses": 10, "effect": "stabilize creature at 0 HP"}},
    {"equipment_id": "holy_water", "category": "adventuring_gear", "subcategory": "consumable", "weight": 1.0, "cost_gp": 25.0,
     "properties": {"damage": "2d8", "damage_type": "radiant", "range": "20", "targets": ["fiend", "undead"]}},
    {"equipment_id": "hunting_trap", "category": "adventuring_gear", "subcategory": "trap", "weight": 25.0, "cost_gp": 5.0,
     "properties": {"dc": 13, "damage": "1d4", "effect": "speed 0, restrained"}},
    {"equipment_id": "ink", "category": "adventuring_gear", "subcategory": "writing", "weight": 0.0, "cost_gp": 10.0,
     "properties": {"capacity": "1 oz", "pages": 500}},
    {"equipment_id": "lamp", "category": "adventuring_gear", "subcategory": "light", "weight": 1.0, "cost_gp": 0.5,
     "properties": {"fuel": "oil", "bright_light": "15 ft", "dim_light": "45 ft"}},
    {"equipment_id": "lantern_bullseye", "category": "adventuring_gear", "subcategory": "light", "weight": 2.0, "cost_gp": 10.0,
     "properties": {"fuel": "oil", "bright_light": "60 ft cone", "dim_light": "120 ft cone"}},
    {"equipment_id": "lantern_hooded", "category": "adventuring_gear", "subcategory": "light", "weight": 2.0, "cost_gp": 5.0,
     "properties": {"fuel": "oil", "bright_light": "30 ft", "dim_light": "60 ft", "can_dim": True}},
    {"equipment_id": "lock", "category": "adventuring_gear", "subcategory": "utility", "weight": 1.0, "cost_gp": 10.0,
     "properties": {"pick_dc": 15}},
    {"equipment_id": "magnifying_glass", "category": "adventuring_gear", "subcategory": "utility", "weight": 0.0, "cost_gp": 100.0,
     "properties": {"effect": "advantage on appraisal checks"}},
    {"equipment_id": "manacles", "category": "adventuring_gear", "subcategory": "restraint", "weight": 6.0, "cost_gp": 2.0,
     "properties": {"escape_dc": 20, "break_dc": 25}},
    {"equipment_id": "net", "category": "adventuring_gear", "subcategory": "weapon", "weight": 3.0, "cost_gp": 1.0,
     "properties": {"range": "15", "effect": "restrained"}},
    {"equipment_id": "oil", "category": "adventuring_gear", "subcategory": "consumable", "weight": 1.0, "cost_gp": 0.1,
     "properties": {"damage": 5, "damage_type": "fire", "area": "5 ft square", "fuel_hours": 6}},
    {"equipment_id": "potion_of_healing", "category": "adventuring_gear", "subcategory": "consumable", "weight": 0.5, "cost_gp": 50.0,
     "requires_attunement": False, "rarity": "common", "properties": {"healing": "2d4+2", "action": "bonus action"}},
    {"equipment_id": "rations", "category": "adventuring_gear", "subcategory": "food", "weight": 2.0, "cost_gp": 0.5,
     "properties": {"days": 1}},
    {"equipment_id": "rope", "category": "adventuring_gear", "subcategory": "utility", "weight": 5.0, "cost_gp": 1.0,
     "properties": {"length": "50 ft", "break_dc": 20}},
    {"equipment_id": "spyglass", "category": "adventuring_gear", "subcategory": "utility", "weight": 1.0, "cost_gp": 1000.0,
     "properties": {"magnification": "2x"}},
    {"equipment_id": "tent", "category": "adventuring_gear", "subcategory": "camping", "weight": 20.0, "cost_gp": 2.0,
     "properties": {"capacity": "2 medium creatures"}},
    {"equipment_id": "tinderbox", "category": "adventuring_gear", "subcategory": "utility", "weight": 1.0, "cost_gp": 0.5,
     "properties": {"effect": "light fire (bonus action for torch/lamp)"}},
    {"equipment_id": "torch", "category": "adventuring_gear", "subcategory": "light", "weight": 1.0, "cost_gp": 0.01,
     "properties": {"duration": "1 hour", "bright_light": "20 ft", "dim_light": "40 ft", "damage": 1, "damage_type": "fire"}},
    {"equipment_id": "waterskin", "category": "adventuring_gear", "subcategory": "container", "weight": 5.0, "cost_gp": 0.2,
     "properties": {"capacity": "4 pints"}},
]

# ============== AMMUNITION ==============

AMMUNITION = [
    {"equipment_id": "arrows", "category": "ammunition", "subcategory": "arrow", "weight": 1.0, "cost_gp": 1.0, "properties": {"quantity": 20}},
    {"equipment_id": "bolts", "category": "ammunition", "subcategory": "bolt", "weight": 1.5, "cost_gp": 1.0, "properties": {"quantity": 20}},
    {"equipment_id": "bullets_firearm", "category": "ammunition", "subcategory": "bullet", "weight": 2.0, "cost_gp": 3.0, "properties": {"quantity": 10}},
    {"equipment_id": "bullets_sling", "category": "ammunition", "subcategory": "bullet", "weight": 1.5, "cost_gp": 0.04, "properties": {"quantity": 20}},
    {"equipment_id": "needles", "category": "ammunition", "subcategory": "needle", "weight": 1.0, "cost_gp": 1.0, "properties": {"quantity": 50}},
]

# ============== TOOLS ==============

ARTISAN_TOOLS = [
    {"equipment_id": "alchemists_supplies", "category": "tool", "subcategory": "artisan", "weight": 8.0, "cost_gp": 50.0,
     "properties": {"ability": "intelligence", "can_craft": ["acid", "alchemists_fire", "oil", "perfume"]}},
    {"equipment_id": "brewers_supplies", "category": "tool", "subcategory": "artisan", "weight": 9.0, "cost_gp": 20.0,
     "properties": {"ability": "intelligence", "can_craft": ["antitoxin"]}},
    {"equipment_id": "calligraphers_supplies", "category": "tool", "subcategory": "artisan", "weight": 5.0, "cost_gp": 10.0,
     "properties": {"ability": "dexterity", "can_craft": ["ink", "spell_scroll"]}},
    {"equipment_id": "carpenters_tools", "category": "tool", "subcategory": "artisan", "weight": 6.0, "cost_gp": 8.0,
     "properties": {"ability": "strength", "can_craft": ["club", "greatclub", "quarterstaff", "ladder", "torch"]}},
    {"equipment_id": "cartographers_tools", "category": "tool", "subcategory": "artisan", "weight": 6.0, "cost_gp": 15.0,
     "properties": {"ability": "wisdom", "can_craft": ["map"]}},
    {"equipment_id": "cobblers_tools", "category": "tool", "subcategory": "artisan", "weight": 5.0, "cost_gp": 5.0,
     "properties": {"ability": "dexterity", "can_craft": ["climbers_kit"]}},
    {"equipment_id": "cooks_utensils", "category": "tool", "subcategory": "artisan", "weight": 8.0, "cost_gp": 1.0,
     "properties": {"ability": "wisdom", "can_craft": ["rations"]}},
    {"equipment_id": "glassblowers_tools", "category": "tool", "subcategory": "artisan", "weight": 5.0, "cost_gp": 30.0,
     "properties": {"ability": "intelligence", "can_craft": ["glass_bottle", "magnifying_glass", "spyglass", "vial"]}},
    {"equipment_id": "jewelers_tools", "category": "tool", "subcategory": "artisan", "weight": 2.0, "cost_gp": 25.0,
     "properties": {"ability": "intelligence", "can_craft": ["arcane_focus", "holy_symbol"]}},
    {"equipment_id": "leatherworkers_tools", "category": "tool", "subcategory": "artisan", "weight": 5.0, "cost_gp": 5.0,
     "properties": {"ability": "dexterity", "can_craft": ["sling", "whip", "hide_armor", "leather_armor", "studded_leather_armor", "backpack"]}},
    {"equipment_id": "masons_tools", "category": "tool", "subcategory": "artisan", "weight": 8.0, "cost_gp": 10.0,
     "properties": {"ability": "strength", "can_craft": ["block_and_tackle"]}},
    {"equipment_id": "painters_supplies", "category": "tool", "subcategory": "artisan", "weight": 5.0, "cost_gp": 10.0,
     "properties": {"ability": "wisdom", "can_craft": ["druidic_focus", "holy_symbol"]}},
    {"equipment_id": "potters_tools", "category": "tool", "subcategory": "artisan", "weight": 3.0, "cost_gp": 10.0,
     "properties": {"ability": "intelligence", "can_craft": ["jug", "lamp"]}},
    {"equipment_id": "smiths_tools", "category": "tool", "subcategory": "artisan", "weight": 8.0, "cost_gp": 20.0,
     "properties": {"ability": "strength", "can_craft": ["melee_weapons", "medium_armor", "heavy_armor", "chain"]}},
    {"equipment_id": "tinkers_tools", "category": "tool", "subcategory": "artisan", "weight": 10.0, "cost_gp": 50.0,
     "properties": {"ability": "dexterity", "can_craft": ["musket", "pistol", "lantern_bullseye", "lantern_hooded", "lock"]}},
    {"equipment_id": "weavers_tools", "category": "tool", "subcategory": "artisan", "weight": 5.0, "cost_gp": 1.0,
     "properties": {"ability": "dexterity", "can_craft": ["padded_armor", "net", "rope", "tent"]}},
    {"equipment_id": "woodcarvers_tools", "category": "tool", "subcategory": "artisan", "weight": 5.0, "cost_gp": 1.0,
     "properties": {"ability": "dexterity", "can_craft": ["club", "quarterstaff", "ranged_weapons", "arrows", "bolts"]}},
]

OTHER_TOOLS = [
    {"equipment_id": "disguise_kit", "category": "tool", "subcategory": "kit", "weight": 3.0, "cost_gp": 25.0,
     "properties": {"ability": "charisma", "dc": 10}},
    {"equipment_id": "forgery_kit", "category": "tool", "subcategory": "kit", "weight": 5.0, "cost_gp": 15.0,
     "properties": {"ability": "dexterity", "dc": 15}},
    {"equipment_id": "herbalism_kit", "category": "tool", "subcategory": "kit", "weight": 3.0, "cost_gp": 5.0,
     "properties": {"ability": "intelligence", "can_craft": ["antitoxin", "healers_kit", "potion_of_healing"]}},
    {"equipment_id": "navigators_tools", "category": "tool", "subcategory": "navigation", "weight": 2.0, "cost_gp": 25.0,
     "properties": {"ability": "wisdom"}},
    {"equipment_id": "poisoners_kit", "category": "tool", "subcategory": "kit", "weight": 2.0, "cost_gp": 50.0,
     "properties": {"ability": "intelligence", "can_craft": ["basic_poison"]}},
    {"equipment_id": "thieves_tools", "category": "tool", "subcategory": "kit", "weight": 1.0, "cost_gp": 25.0,
     "properties": {"ability": "dexterity", "dc": 15}},
]

GAMING_SETS = [
    {"equipment_id": "dice_set", "category": "tool", "subcategory": "gaming", "weight": 0.0, "cost_gp": 0.1, "properties": {"ability": "wisdom"}},
    {"equipment_id": "dragonchess_set", "category": "tool", "subcategory": "gaming", "weight": 0.5, "cost_gp": 1.0, "properties": {"ability": "wisdom"}},
    {"equipment_id": "playing_cards", "category": "tool", "subcategory": "gaming", "weight": 0.0, "cost_gp": 0.5, "properties": {"ability": "wisdom"}},
    {"equipment_id": "three_dragon_ante", "category": "tool", "subcategory": "gaming", "weight": 0.0, "cost_gp": 1.0, "properties": {"ability": "wisdom"}},
]

MUSICAL_INSTRUMENTS = [
    {"equipment_id": "bagpipes", "category": "tool", "subcategory": "musical", "weight": 6.0, "cost_gp": 30.0, "properties": {"ability": "charisma"}},
    {"equipment_id": "drum", "category": "tool", "subcategory": "musical", "weight": 3.0, "cost_gp": 6.0, "properties": {"ability": "charisma"}},
    {"equipment_id": "dulcimer", "category": "tool", "subcategory": "musical", "weight": 10.0, "cost_gp": 25.0, "properties": {"ability": "charisma"}},
    {"equipment_id": "flute", "category": "tool", "subcategory": "musical", "weight": 1.0, "cost_gp": 2.0, "properties": {"ability": "charisma"}},
    {"equipment_id": "horn", "category": "tool", "subcategory": "musical", "weight": 2.0, "cost_gp": 3.0, "properties": {"ability": "charisma"}},
    {"equipment_id": "lute", "category": "tool", "subcategory": "musical", "weight": 2.0, "cost_gp": 35.0, "properties": {"ability": "charisma"}},
    {"equipment_id": "lyre", "category": "tool", "subcategory": "musical", "weight": 2.0, "cost_gp": 30.0, "properties": {"ability": "charisma"}},
    {"equipment_id": "pan_flute", "category": "tool", "subcategory": "musical", "weight": 2.0, "cost_gp": 12.0, "properties": {"ability": "charisma"}},
    {"equipment_id": "shawm", "category": "tool", "subcategory": "musical", "weight": 1.0, "cost_gp": 2.0, "properties": {"ability": "charisma"}},
    {"equipment_id": "viol", "category": "tool", "subcategory": "musical", "weight": 1.0, "cost_gp": 30.0, "properties": {"ability": "charisma"}},
]

# ============== ARCANE FOCUS ==============

ARCANE_FOCUS = [
    {"equipment_id": "crystal", "category": "arcane_focus", "subcategory": None, "weight": 1.0, "cost_gp": 10.0, "properties": {}},
    {"equipment_id": "orb", "category": "arcane_focus", "subcategory": None, "weight": 3.0, "cost_gp": 20.0, "properties": {}},
    {"equipment_id": "rod", "category": "arcane_focus", "subcategory": None, "weight": 2.0, "cost_gp": 10.0, "properties": {}},
    {"equipment_id": "staff", "category": "arcane_focus", "subcategory": None, "weight": 4.0, "cost_gp": 5.0, "properties": {}},
    {"equipment_id": "wand", "category": "arcane_focus", "subcategory": None, "weight": 1.0, "cost_gp": 10.0, "properties": {}},
]

# ============== HOLY SYMBOL ==============

HOLY_SYMBOLS = [
    {"equipment_id": "amulet", "category": "holy_symbol", "subcategory": None, "weight": 1.0, "cost_gp": 5.0, "properties": {"worn": True}},
    {"equipment_id": "emblem", "category": "holy_symbol", "subcategory": None, "weight": 0.0, "cost_gp": 5.0, "properties": {"painted": True}},
    {"equipment_id": "reliquary", "category": "holy_symbol", "subcategory": None, "weight": 2.0, "cost_gp": 5.0, "properties": {"held": True}},
]

# ============== DRUIDIC FOCUS ==============

DRUIDIC_FOCUS = [
    {"equipment_id": "sprig_of_mistletoe", "category": "druidic_focus", "subcategory": None, "weight": 0.0, "cost_gp": 1.0, "properties": {}},
    {"equipment_id": "wooden_staff", "category": "druidic_focus", "subcategory": None, "weight": 4.0, "cost_gp": 5.0, "properties": {}},
    {"equipment_id": "yew_wand", "category": "druidic_focus", "subcategory": None, "weight": 1.0, "cost_gp": 10.0, "properties": {}},
]


# ============== SEED FUNCTION ==============

async def seed_equipment():
    """Seed equipment data into database."""
    async with async_session_maker() as session:
        # Combine all equipment
        all_equipment = (
            SIMPLE_MELEE_WEAPONS +
            SIMPLE_RANGED_WEAPONS +
            MARTIAL_MELEE_WEAPONS +
            MARTIAL_RANGED_WEAPONS +
            LIGHT_ARMOR +
            MEDIUM_ARMOR +
            HEAVY_ARMOR +
            SHIELDS +
            ADVENTURING_GEAR +
            AMMUNITION +
            ARTISAN_TOOLS +
            OTHER_TOOLS +
            GAMING_SETS +
            MUSICAL_INSTRUMENTS +
            ARCANE_FOCUS +
            HOLY_SYMBOLS +
            DRUIDIC_FOCUS
        )
        
        count = 0
        for item in all_equipment:
            # Check if exists
            result = await session.execute(
                select(SRDEquipment).where(SRDEquipment.equipment_id == item["equipment_id"])
            )
            existing = result.scalar_one_or_none()
            
            if not existing:
                equipment = SRDEquipment(
                    equipment_id=item["equipment_id"],
                    category=item["category"],
                    subcategory=item.get("subcategory"),
                    weight=item.get("weight", 0.0),
                    cost_gp=item.get("cost_gp", 0.0),
                    requires_attunement=item.get("requires_attunement", False),
                    rarity=item.get("rarity"),
                    properties=item.get("properties", {})
                )
                session.add(equipment)
                count += 1
        
        await session.commit()
        print(f"✅ Seeded {count} equipment items")


async def seed_damage_types():
    """Seed damage type data into database."""
    async with async_session_maker() as session:
        count = 0
        for dt in DAMAGE_TYPES:
            result = await session.execute(
                select(SRDDamageType).where(SRDDamageType.damage_type_id == dt["damage_type_id"])
            )
            existing = result.scalar_one_or_none()
            
            if not existing:
                damage_type = SRDDamageType(
                    damage_type_id=dt["damage_type_id"],
                    category=dt["category"],
                    properties=dt.get("properties", {})
                )
                session.add(damage_type)
                count += 1
        
        await session.commit()
        print(f"✅ Seeded {count} damage types")


async def main():
    print("🎲 Seeding D&D 5e Equipment Data...")
    await seed_damage_types()
    await seed_equipment()
    print("✨ Done!")


if __name__ == "__main__":
    asyncio.run(main())
