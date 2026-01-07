"""Seed script for D&D 5e (2024) Races/Species data."""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from src.db import async_session_maker
from src.models import SRDRace


# D&D 5e (2024) Races/Species Data
RACES = [
    # ========================================
    # AASIMAR
    # ========================================
    {
        "key": "aasimar",
        "speed": 30,
        "size": "medium_or_small",
        "size_options": ["medium", "small"],
        "ability_bonuses": {},  # 2024 rules: no fixed ability bonuses
        "traits": {
            "creature_type": "humanoid",
            "darkvision": 60,
            "celestial_resistance": {
                "damage_types": ["necrotic", "radiant"]
            },
            "healing_hands": {
                "description": "Touch to heal, roll d4 equal to proficiency bonus",
                "uses": "proficiency_bonus",
                "recharge": "long_rest"
            },
            "light_bearer": {
                "cantrip": "light",
                "spellcasting_ability": "charisma"
            },
            "celestial_revelation": {
                "unlock_level": 3,
                "duration": "1 minute",
                "uses": 1,
                "recharge": "long_rest",
                "options": {
                    "heavenly_wings": {
                        "effect": "Gain flying speed equal to walking speed",
                        "damage_type": "radiant"
                    },
                    "inner_radiance": {
                        "effect": "Shed bright light 10ft, dim 10ft more. End of each turn, creatures within 10ft take radiant damage equal to proficiency bonus",
                        "damage_type": "radiant"
                    },
                    "necrotic_shroud": {
                        "effect": "Creatures within 10ft must save or be frightened",
                        "save": "charisma",
                        "damage_type": "necrotic"
                    }
                },
                "bonus_damage": "proficiency_bonus"
            }
        }
    },

    # ========================================
    # DRAGONBORN
    # ========================================
    {
        "key": "dragonborn",
        "speed": 30,
        "size": "medium",
        "ability_bonuses": {},
        "traits": {
            "creature_type": "humanoid",
            "darkvision": 60,
            "draconic_ancestry": {
                "description": "Choose dragon type for damage type",
                "options": {
                    "black": "acid",
                    "blue": "lightning",
                    "brass": "fire",
                    "bronze": "lightning",
                    "copper": "acid",
                    "gold": "fire",
                    "green": "poison",
                    "red": "fire",
                    "silver": "cold",
                    "white": "cold"
                }
            },
            "breath_weapon": {
                "description": "Replace one attack with breath weapon",
                "area_options": {
                    "cone": "15 feet",
                    "line": "30 feet long, 5 feet wide"
                },
                "save": "dexterity",
                "dc": "8 + con_mod + proficiency_bonus",
                "damage_scaling": {
                    "1": "1d10",
                    "5": "2d10",
                    "11": "3d10",
                    "17": "4d10"
                },
                "uses": "proficiency_bonus",
                "recharge": "long_rest"
            },
            "damage_resistance": {
                "type": "ancestry_damage_type"
            },
            "draconic_flight": {
                "unlock_level": 5,
                "description": "Spectral wings for 10 minutes",
                "flying_speed": "equal to walking speed",
                "uses": 1,
                "recharge": "long_rest"
            }
        }
    },

    # ========================================
    # DWARF
    # ========================================
    {
        "key": "dwarf",
        "speed": 30,
        "size": "medium",
        "ability_bonuses": {},
        "traits": {
            "creature_type": "humanoid",
            "darkvision": 120,
            "dwarven_resilience": {
                "damage_resistance": ["poison"],
                "save_advantage": ["poisoned"]
            },
            "dwarven_toughness": {
                "hp_bonus": 1,
                "hp_bonus_per_level": 1
            },
            "stonecunning": {
                "description": "Bonus action to gain tremorsense 60ft for 10 minutes while on stone",
                "range": 60,
                "duration": "10 minutes",
                "uses": "proficiency_bonus",
                "recharge": "long_rest"
            }
        }
    },

    # ========================================
    # ELF
    # ========================================
    {
        "key": "elf",
        "speed": 30,
        "size": "medium",
        "ability_bonuses": {},
        "traits": {
            "creature_type": "humanoid",
            "darkvision": 60,
            "fey_ancestry": {
                "save_advantage": ["charmed"]
            },
            "keen_senses": {
                "skill_proficiency_choice": ["insight", "perception", "survival"],
                "choose": 1
            },
            "trance": {
                "description": "Don't need sleep, can complete long rest in 4 hours of meditation",
                "long_rest_hours": 4
            },
            "lineage": {
                "required": True,
                "spellcasting_ability_choice": ["intelligence", "wisdom", "charisma"],
                "options": {
                    "drow": {
                        "darkvision_upgrade": 120,
                        "cantrip_1": "dancing_lights",
                        "spell_3": "faerie_fire",
                        "spell_5": "darkness"
                    },
                    "high_elf": {
                        "cantrip_1": "prestidigitation",
                        "cantrip_swap": "wizard_spell_list",
                        "spell_3": "detect_magic",
                        "spell_5": "misty_step"
                    },
                    "wood_elf": {
                        "speed_bonus": 5,
                        "cantrip_1": "druidcraft",
                        "spell_3": "longstrider",
                        "spell_5": "pass_without_trace"
                    }
                }
            }
        }
    },

    # ========================================
    # GNOME
    # ========================================
    {
        "key": "gnome",
        "speed": 30,
        "size": "small",
        "ability_bonuses": {},
        "traits": {
            "creature_type": "humanoid",
            "darkvision": 60,
            "gnomish_cunning": {
                "save_advantage_abilities": ["intelligence", "wisdom", "charisma"]
            },
            "lineage": {
                "required": True,
                "spellcasting_ability_choice": ["intelligence", "wisdom", "charisma"],
                "options": {
                    "forest_gnome": {
                        "cantrip": "minor_illusion",
                        "speak_with_animals": {
                            "always_prepared": True,
                            "free_uses": "proficiency_bonus",
                            "recharge": "long_rest"
                        }
                    },
                    "rock_gnome": {
                        "cantrips": ["mending", "prestidigitation"],
                        "tinker": {
                            "description": "Create Tiny clockwork devices using prestidigitation",
                            "max_devices": 3,
                            "duration": "8 hours"
                        }
                    }
                }
            }
        }
    },

    # ========================================
    # GOLIATH
    # ========================================
    {
        "key": "goliath",
        "speed": 35,
        "size": "medium",
        "ability_bonuses": {},
        "traits": {
            "creature_type": "humanoid",
            "powerful_build": {
                "description": "Count as one size larger for carrying capacity",
                "grapple_advantage": True
            },
            "large_form": {
                "unlock_level": 5,
                "description": "Bonus action to become Large for 10 minutes",
                "duration": "10 minutes",
                "benefits": {
                    "strength_advantage": True,
                    "speed_bonus": 10
                },
                "uses": 1,
                "recharge": "long_rest"
            },
            "giant_ancestry": {
                "required": True,
                "uses": "proficiency_bonus",
                "recharge": "long_rest",
                "options": {
                    "cloud_giant": {
                        "name": "clouds_jaunt",
                        "description": "Bonus action to teleport 30 feet to visible unoccupied space"
                    },
                    "fire_giant": {
                        "name": "fires_burn",
                        "description": "When you hit with attack, deal extra 1d10 fire damage"
                    },
                    "frost_giant": {
                        "name": "frosts_chill",
                        "description": "When you hit with attack, deal extra 1d6 cold damage and reduce speed by 10 feet until your next turn"
                    },
                    "hill_giant": {
                        "name": "hills_tumble",
                        "description": "When you hit with attack, knock target prone"
                    },
                    "stone_giant": {
                        "name": "stones_endurance",
                        "description": "Reaction when taking damage, roll 1d12 + Constitution modifier to reduce damage"
                    },
                    "storm_giant": {
                        "name": "storms_thunder",
                        "description": "Reaction when damaged by creature within 60 feet, deal 1d8 thunder damage to attacker"
                    }
                }
            }
        }
    },

    # ========================================
    # HALFLING
    # ========================================
    {
        "key": "halfling",
        "speed": 30,
        "size": "small",
        "ability_bonuses": {},
        "traits": {
            "creature_type": "humanoid",
            "brave": {
                "save_advantage": ["frightened"]
            },
            "halfling_nimbleness": {
                "description": "Move through space of any creature larger than you"
            },
            "luck": {
                "description": "When you roll a 1 on d20 test, reroll and use new roll"
            },
            "naturally_stealthy": {
                "description": "Can take Hide action even when only obscured by creature at least one size larger"
            }
        }
    },

    # ========================================
    # HUMAN
    # ========================================
    {
        "key": "human",
        "speed": 30,
        "size": "medium_or_small",
        "size_options": ["medium", "small"],
        "ability_bonuses": {},
        "traits": {
            "creature_type": "humanoid",
            "resourceful": {
                "description": "Gain Heroic Inspiration when you finish a Long Rest"
            },
            "skillful": {
                "skill_proficiency_choice": "any",
                "choose": 1
            },
            "versatile": {
                "origin_feat": True,
                "recommended": "skilled"
            }
        }
    },

    # ========================================
    # ORC
    # ========================================
    {
        "key": "orc",
        "speed": 30,
        "size": "medium",
        "ability_bonuses": {},
        "traits": {
            "creature_type": "humanoid",
            "darkvision": 120,
            "adrenaline_rush": {
                "description": "Bonus action to Dash and gain temporary HP equal to proficiency bonus",
                "uses": "proficiency_bonus",
                "recharge": "short_or_long_rest"
            },
            "relentless_endurance": {
                "description": "When reduced to 0 HP but not killed, drop to 1 HP instead",
                "uses": 1,
                "recharge": "long_rest"
            }
        }
    },

    # ========================================
    # TIEFLING
    # ========================================
    {
        "key": "tiefling",
        "speed": 30,
        "size": "medium_or_small",
        "size_options": ["medium", "small"],
        "ability_bonuses": {},
        "traits": {
            "creature_type": "humanoid",
            "darkvision": 60,
            "otherworldly_presence": {
                "cantrip": "thaumaturgy",
                "spellcasting_ability": "legacy_choice"
            },
            "fiendish_legacy": {
                "required": True,
                "spellcasting_ability_choice": ["intelligence", "wisdom", "charisma"],
                "options": {
                    "abyssal": {
                        "damage_resistance": "poison",
                        "cantrip_1": "poison_spray",
                        "spell_3": "ray_of_sickness",
                        "spell_5": "hold_person"
                    },
                    "chthonic": {
                        "damage_resistance": "necrotic",
                        "cantrip_1": "chill_touch",
                        "spell_3": "false_life",
                        "spell_5": "ray_of_enfeeblement"
                    },
                    "infernal": {
                        "damage_resistance": "fire",
                        "cantrip_1": "fire_bolt",
                        "spell_3": "hellish_rebuke",
                        "spell_5": "darkness"
                    }
                }
            }
        }
    },
]


async def seed_races():
    """Seed the SRD races table with D&D 5e (2024) data."""
    async with async_session() as session:
        # Check existing races
        result = await session.execute(select(SRDRace))
        existing = {r.key for r in result.scalars().all()}
        
        added = 0
        updated = 0
        
        for race_data in RACES:
            key = race_data["key"]
            
            if key in existing:
                # Update existing race
                result = await session.execute(
                    select(SRDRace).where(SRDRace.key == key)
                )
                race = result.scalar_one()
                race.speed = race_data["speed"]
                race.size = race_data["size"]
                race.ability_bonuses = race_data.get("ability_bonuses", {})
                race.traits = race_data.get("traits", {})
                updated += 1
                print(f"  Updated: {key}")
            else:
                # Create new race
                race = SRDRace(
                    key=key,
                    speed=race_data["speed"],
                    size=race_data["size"],
                    ability_bonuses=race_data.get("ability_bonuses", {}),
                    traits=race_data.get("traits", {})
                )
                session.add(race)
                added += 1
                print(f"  Added: {key}")
        
        await session.commit()
        
        print(f"\n✅ Races seeding complete!")
        print(f"   Added: {added}")
        print(f"   Updated: {updated}")
        print(f"   Total: {len(RACES)}")


if __name__ == "__main__":
    print("🎲 Seeding D&D 5e (2024) Races/Species data...")
    print("=" * 50)
    asyncio.run(seed_races())
