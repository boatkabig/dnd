from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db
from src.models import Character, Campaign, CharacterCondition, User
from src.routers.auth import get_current_user

router = APIRouter()


# Schemas
class AbilityScores(BaseModel):
    strength: int = 10
    dexterity: int = 10
    constitution: int = 10
    intelligence: int = 10
    wisdom: int = 10
    charisma: int = 10
    
    def to_short_keys(self) -> dict:
        """Convert to short key format for storage."""
        return {
            "str": self.strength,
            "dex": self.dexterity,
            "con": self.constitution,
            "int": self.intelligence,
            "wis": self.wisdom,
            "cha": self.charisma,
        }


class CharacterCreate(BaseModel):
    campaign_id: uuid.UUID
    name: str
    class_key: str | None = None
    race_key: str | None = None
    background_key: str | None = None
    ability_scores: AbilityScores = AbilityScores()


class CharacterUpdate(BaseModel):
    name: str | None = None
    class_key: str | None = None
    race_key: str | None = None
    background_key: str | None = None
    level: int | None = None
    ability_scores: AbilityScores | None = None
    hp_current: int | None = None
    hp_max: int | None = None
    hp_temp: int | None = None
    ac: int | None = None
    equipment: dict | None = None
    spells: dict | None = None
    features: dict | None = None


class ConditionResponse(BaseModel):
    id: uuid.UUID
    condition_type: str
    duration_rounds: int | None
    source: str | None

    class Config:
        from_attributes = True


class CharacterResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    campaign_id: uuid.UUID
    name: str
    class_key: str | None
    race_key: str | None
    background_key: str | None
    level: int
    ability_scores: dict
    hp_current: int
    hp_max: int
    hp_temp: int
    ac: int
    equipment: dict
    spells: dict
    features: dict
    conditions: list[ConditionResponse] = []

    class Config:
        from_attributes = True


# Endpoints
@router.get("/", response_model=list[CharacterResponse])
async def list_characters(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    campaign_id: uuid.UUID | None = Query(None),
):
    """List user's characters, optionally filtered by campaign."""
    query = select(Character).where(Character.user_id == current_user.id)
    if campaign_id:
        query = query.where(Character.campaign_id == campaign_id)
    
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=CharacterResponse)
async def create_character(
    char_data: CharacterCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new character."""
    # Verify campaign exists
    result = await db.execute(select(Campaign).where(Campaign.id == char_data.campaign_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    character = Character(
        user_id=current_user.id,
        campaign_id=char_data.campaign_id,
        name=char_data.name,
        class_key=char_data.class_key,
        race_key=char_data.race_key,
        background_key=char_data.background_key,
        ability_scores=char_data.ability_scores.to_short_keys(),
    )
    db.add(character)
    await db.flush()
    await db.refresh(character)
    return character


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get character by ID."""
    result = await db.execute(
        select(Character).where(Character.id == character_id)
    )
    character = result.scalar_one_or_none()
    
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    # Check access (owner or DM of campaign)
    if character.user_id != current_user.id:
        campaign_result = await db.execute(
            select(Campaign).where(Campaign.id == character.campaign_id)
        )
        campaign = campaign_result.scalar_one_or_none()
        if not campaign or campaign.dm_id != current_user.id:
            raise HTTPException(status_code=403, detail="No access to this character")
    
    return character


@router.put("/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: uuid.UUID,
    char_data: CharacterUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update character."""
    result = await db.execute(
        select(Character).where(Character.id == character_id)
    )
    character = result.scalar_one_or_none()
    
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    if character.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot edit other's character")
    
    update_data = char_data.model_dump(exclude_unset=True)
    if "ability_scores" in update_data and update_data["ability_scores"]:
        update_data["ability_scores"] = char_data.ability_scores.model_dump()
    
    for field, value in update_data.items():
        setattr(character, field, value)
    
    await db.flush()
    await db.refresh(character)
    return character
