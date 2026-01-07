import uuid
import secrets
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db import Base


class Campaign(Base):
    """Campaign model representing a game session/world."""
    
    __tablename__ = "campaigns"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    dm_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("users.id"), 
        nullable=False
    )
    invite_code: Mapped[str] = mapped_column(
        String(12), 
        unique=True, 
        nullable=False,
        default=lambda: secrets.token_urlsafe(8)
    )
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now()
    )
    
    # Relationships
    dm = relationship("User", back_populates="campaigns", foreign_keys=[dm_id])
    characters = relationship("Character", back_populates="campaign")
    game_logs = relationship("GameLog", back_populates="campaign")
    combat = relationship("Combat", back_populates="campaign", uselist=False)
