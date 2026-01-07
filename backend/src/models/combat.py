import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db import Base


class Combat(Base):
    """Active combat state for a campaign."""
    
    __tablename__ = "combats"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("campaigns.id"), 
        nullable=False,
        unique=True  # Only one active combat per campaign
    )
    current_round: Mapped[int] = mapped_column(Integer, default=1)
    current_turn_index: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now()
    )
    
    # Relationships
    campaign = relationship("Campaign", back_populates="combat")
    participants = relationship("CombatParticipant", back_populates="combat", order_by="CombatParticipant.turn_order")


class CombatParticipant(Base):
    """Participant in combat with initiative order."""
    
    __tablename__ = "combat_participants"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    combat_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("combats.id", ondelete="CASCADE"), 
        nullable=False
    )
    character_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("characters.id"), 
        nullable=True  # Null for NPCs/Monsters
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # For NPCs
    initiative: Mapped[int] = mapped_column(Integer, nullable=False)
    turn_order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_npc: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Relationships
    combat = relationship("Combat", back_populates="participants")
