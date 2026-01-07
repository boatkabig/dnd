"""SRD (System Reference Document) models for DND 5e data."""

import uuid
from sqlalchemy import String, Integer, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db import Base


class SRDClass(Base):
    """Character class from SRD (e.g., Fighter, Wizard)."""
    
    __tablename__ = "srd_classes"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    hit_die: Mapped[str] = mapped_column(String(10), nullable=False)  # e.g., "d10"
    primary_ability: Mapped[str] = mapped_column(String(50), nullable=True)  # e.g., "str" or "str_or_dex"
    saving_throw_proficiencies: Mapped[list] = mapped_column(JSONB, default=list)  # ["str", "con"]
    features: Mapped[dict] = mapped_column(JSONB, default=dict)  # Level-based features


class SRDRace(Base):
    """Character race/species from SRD (e.g., Human, Elf)."""
    
    __tablename__ = "srd_races"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    speed: Mapped[int] = mapped_column(Integer, default=30)
    size: Mapped[str] = mapped_column(String(20), default="medium")
    ability_bonuses: Mapped[dict] = mapped_column(JSONB, default=dict)  # {"str": 2, "con": 1}
    traits: Mapped[dict] = mapped_column(JSONB, default=dict)


class SRDSpell(Base):
    """Spell from SRD."""
    
    __tablename__ = "srd_spells"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    level: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # 0 = cantrip
    school: Mapped[str] = mapped_column(String(50), nullable=False)  # evocation, abjuration, etc.
    casting_time: Mapped[str] = mapped_column(String(50), nullable=True)
    range: Mapped[str] = mapped_column(String(50), nullable=True)
    duration: Mapped[str] = mapped_column(String(50), nullable=True)
    components: Mapped[dict] = mapped_column(JSONB, default=dict)  # {"v": true, "s": true, "m": "a pinch of salt"}
    classes: Mapped[list] = mapped_column(JSONB, default=list)  # ["wizard", "sorcerer"]


class SRDMonster(Base):
    """Monster/NPC from SRD."""
    
    __tablename__ = "srd_monsters"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    size: Mapped[str] = mapped_column(String(20), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # beast, humanoid, undead, etc.
    challenge_rating: Mapped[str] = mapped_column(String(10), nullable=False)  # "1/4", "1", "20"
    armor_class: Mapped[int] = mapped_column(Integer, nullable=False)
    hit_points: Mapped[str] = mapped_column(String(50), nullable=False)  # "52 (8d8+16)"
    speed: Mapped[dict] = mapped_column(JSONB, default=dict)  # {"walk": 30, "fly": 60}
    ability_scores: Mapped[dict] = mapped_column(JSONB, default=dict)
    actions: Mapped[dict] = mapped_column(JSONB, default=dict)


class SRDTrinket(Base):
    """Trinket from SRD Character Creation."""
    
    __tablename__ = "srd_trinkets"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    roll_number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)  # 1-100


class SRDBackground(Base):
    """Character background from SRD."""
    
    __tablename__ = "srd_backgrounds"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    skill_proficiencies: Mapped[list] = mapped_column(JSONB, default=list)
    tool_proficiencies: Mapped[list] = mapped_column(JSONB, default=list)
    equipment: Mapped[list] = mapped_column(JSONB, default=list)
    feature_key: Mapped[str] = mapped_column(String(100), nullable=True)


class Translation(Base):
    """Translation table for i18n support."""
    
    __tablename__ = "translations"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # "class", "race", "spell"
    entity_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)  # "fighter", "human"
    lang: Mapped[str] = mapped_column(String(5), nullable=False, index=True)  # "en", "th"
    field: Mapped[str] = mapped_column(String(50), nullable=False)  # "name", "description"
    value: Mapped[str] = mapped_column(Text, nullable=False)
