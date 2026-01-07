"""Equipment models for D&D 5e."""

import uuid
from sqlalchemy import String, Integer, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db import Base


class SRDEquipment(Base):
    """Master data table for equipment items from SRD.
    
    This is the reference table containing all available equipment.
    Characters reference items using equipment_id.
    """
    
    __tablename__ = "srd_equipment"
    
    # Primary key (internal)
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    
    # Equipment identifier (for referencing from characters)
    equipment_id: Mapped[str] = mapped_column(
        String(100), 
        unique=True, 
        nullable=False, 
        index=True
    )  # e.g., "longsword", "chain_mail", "potion_healing"
    
    # Category of equipment
    category: Mapped[str] = mapped_column(
        String(50), 
        nullable=False, 
        index=True
    )  # "weapon", "armor", "adventuring_gear", "tool", "magic_item"
    
    # Subcategory for more specific classification
    subcategory: Mapped[str | None] = mapped_column(
        String(50), 
        nullable=True
    )  # "simple_melee", "martial_ranged", "light_armor", etc.
    
    # Weight in pounds
    weight: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Cost in gold pieces (can be fractional for cp/sp conversion)
    cost_gp: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Magic item attunement
    requires_attunement: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Rarity for magic items
    rarity: Mapped[str | None] = mapped_column(
        String(20), 
        nullable=True
    )  # "common", "uncommon", "rare", "very_rare", "legendary"
    
    # Additional properties as JSONB
    # For weapons: {"damage": "1d8", "damage_type": "slashing", "properties": ["versatile", "finesse"]}
    # For armor: {"ac": 14, "max_dex_bonus": 2, "stealth_disadvantage": true}
    properties: Mapped[dict] = mapped_column(JSONB, default=dict)


class CharacterEquipmentSlot(Base):
    """Equipment slots for a character (what they're wearing/wielding).
    
    This tracks equipped items in specific body slots.
    """
    
    __tablename__ = "character_equipment_slots"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    
    character_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        nullable=False, 
        index=True
    )
    
    slot: Mapped[str] = mapped_column(
        String(30), 
        nullable=False
    )  # "head", "body", "main_hand", "off_hand", "ring_1", "ring_2", etc.
    
    equipment_id: Mapped[str] = mapped_column(
        String(100), 
        nullable=False
    )  # References SRDEquipment.equipment_id


class SRDDamageType(Base):
    """Master data for D&D 5e damage types.
    
    The 13 damage types: Acid, Bludgeoning, Cold, Fire, Force, Lightning,
    Necrotic, Piercing, Poison, Psychic, Radiant, Slashing, Thunder
    """
    
    __tablename__ = "srd_damage_types"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    
    damage_type_id: Mapped[str] = mapped_column(
        String(50), 
        unique=True, 
        nullable=False, 
        index=True
    )  # e.g., "slashing", "fire", "necrotic"
    
    # Category for grouping
    category: Mapped[str] = mapped_column(
        String(30), 
        nullable=False
    )  # "physical", "elemental", "magical"
    
    # Common resistances/immunities
    properties: Mapped[dict] = mapped_column(
        JSONB, 
        default=dict
    )  # e.g., {"common_resistance": ["fire_elemental"], "bypassed_by": ["magic", "silvered"]}


# Damage type constants for reference and seeding
DAMAGE_TYPES = [
    # Physical Damage
    {"damage_type_id": "bludgeoning", "category": "physical", "properties": {
        "description": "From heavy, blunt weapons (maces, hammers, falling rocks)",
        "examples": ["mace", "hammer", "falling damage"]
    }},
    {"damage_type_id": "piercing", "category": "physical", "properties": {
        "description": "From sharp, stabbing weapons (arrows, daggers, claws)",
        "examples": ["arrow", "dagger", "spear", "bite"]
    }},
    {"damage_type_id": "slashing", "category": "physical", "properties": {
        "description": "From cutting weapons (swords, axes)",
        "examples": ["sword", "axe", "claw"]
    }},
    # Elemental Damage
    {"damage_type_id": "acid", "category": "elemental", "properties": {
        "description": "Corrosive substances",
        "examples": ["acid splash", "black dragon breath"]
    }},
    {"damage_type_id": "cold", "category": "elemental", "properties": {
        "description": "Freezing or chilling effects",
        "examples": ["ray of frost", "white dragon breath", "ice storm"]
    }},
    {"damage_type_id": "fire", "category": "elemental", "properties": {
        "description": "Burning damage",
        "examples": ["fireball", "red dragon breath", "burning hands"]
    }},
    {"damage_type_id": "lightning", "category": "elemental", "properties": {
        "description": "Electrical energy",
        "examples": ["lightning bolt", "blue dragon breath", "call lightning"]
    }},
    {"damage_type_id": "thunder", "category": "elemental", "properties": {
        "description": "Sonic or concussive force",
        "examples": ["thunderwave", "shatter"]
    }},
    {"damage_type_id": "poison", "category": "elemental", "properties": {
        "description": "Toxic effects",
        "examples": ["poison spray", "green dragon breath", "cloudkill"]
    }},
    # Magical Damage
    {"damage_type_id": "force", "category": "magical", "properties": {
        "description": "Pure magical energy - rarely resisted",
        "examples": ["magic missile", "eldritch blast", "spiritual weapon"]
    }},
    # Life & Mind Damage
    {"damage_type_id": "necrotic", "category": "life_mind", "properties": {
        "description": "Negative energy, life-draining",
        "examples": ["ray of sickness", "blight", "finger of death"]
    }},
    {"damage_type_id": "radiant", "category": "life_mind", "properties": {
        "description": "Holy or positive energy",
        "examples": ["sacred flame", "guiding bolt", "sunbeam"]
    }},
    {"damage_type_id": "psychic", "category": "life_mind", "properties": {
        "description": "Mind-affecting or mental harm",
        "examples": ["dissonant whispers", "phantasmal killer", "psychic scream"]
    }},
]
