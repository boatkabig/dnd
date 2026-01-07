import uuid
from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db import Base


class Character(Base):
    """Character sheet model for player characters."""
    
    __tablename__ = "characters"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("users.id"), 
        nullable=False
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("campaigns.id"), 
        nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # SRD references (stored as keys for i18n)
    class_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    race_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    background_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    
    level: Mapped[int] = mapped_column(Integer, default=1)
    
    # Ability scores: {"str": 10, "dex": 14, ...}
    ability_scores: Mapped[dict] = mapped_column(
        JSONB, 
        default=lambda: {"str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10}
    )
    
    hp_current: Mapped[int] = mapped_column(Integer, default=10)
    hp_max: Mapped[int] = mapped_column(Integer, default=10)
    hp_temp: Mapped[int] = mapped_column(Integer, default=0)
    ac: Mapped[int] = mapped_column(Integer, default=10)
    
    # Equipment, spells, features stored as JSONB
    equipment: Mapped[dict] = mapped_column(JSONB, default=dict)
    spells: Mapped[dict] = mapped_column(JSONB, default=dict)
    features: Mapped[dict] = mapped_column(JSONB, default=dict)
    
    # Relationships
    user = relationship("User", back_populates="characters")
    campaign = relationship("Campaign", back_populates="characters")
    conditions = relationship("CharacterCondition", back_populates="character")
