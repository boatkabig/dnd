import uuid
from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db import Base


# DND 5e Conditions
CONDITION_TYPES = [
    "blinded",
    "charmed",
    "deafened",
    "frightened",
    "grappled",
    "incapacitated",
    "invisible",
    "paralyzed",
    "petrified",
    "poisoned",
    "prone",
    "restrained",
    "stunned",
    "unconscious",
]


class CharacterCondition(Base):
    """Active condition on a character."""
    
    __tablename__ = "character_conditions"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    character_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("characters.id", ondelete="CASCADE"), 
        nullable=False
    )
    condition_type: Mapped[str] = mapped_column(String(50), nullable=False)
    duration_rounds: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Null = permanent
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Who/what caused it
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now()
    )
    
    # Relationships
    character = relationship("Character", back_populates="conditions")
