import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db import Base


# Game log action types
ACTION_TYPES = [
    "dice_roll",
    "chat_message",
    "combat_start",
    "combat_end",
    "initiative_roll",
    "attack_roll",
    "saving_throw",
    "ability_check",
    "damage",
    "healing",
    "condition_applied",
    "condition_removed",
    "turn_start",
    "turn_end",
    "character_update",
    "dm_action",
]


class GameLog(Base):
    """Game action log for tracking all events."""
    
    __tablename__ = "game_logs"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("campaigns.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("users.id"), 
        nullable=True  # Null for system events
    )
    action_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    
    # Flexible data storage for different action types
    # e.g., {"dice": "1d20", "result": 15, "modifier": 5, "total": 20}
    data: Mapped[dict] = mapped_column(JSONB, default=dict)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(),
        index=True
    )
    
    # Relationships
    campaign = relationship("Campaign", back_populates="game_logs")
