"""DM Control endpoints for managing combat and forcing rolls."""

from typing import Annotated
import uuid
import random

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.db import get_db
from src.models import (
    Campaign, Character, Combat, CombatParticipant, 
    CharacterCondition, GameLog, User, CONDITION_TYPES
)
from src.routers.auth import get_current_user

router = APIRouter()


# Helpers
async def verify_dm(
    campaign_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> Campaign:
    """Verify user is DM of the campaign."""
    result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id)
    )
    campaign = result.scalar_one_or_none()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.dm_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only DM can perform this action")
    
    return campaign


# Schemas
class CombatStart(BaseModel):
    campaign_id: uuid.UUID
    participants: list[dict]  # [{"character_id": "...", "name": "Goblin", "is_npc": true}]


class CombatResponse(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    current_round: int
    current_turn_index: int
    is_active: bool
    participants: list[dict]

    class Config:
        from_attributes = True


class ForcedRollRequest(BaseModel):
    campaign_id: uuid.UUID
    character_id: uuid.UUID
    ability: str  # "str", "dex", "con", "int", "wis", "cha"
    dc: int = 10
    label: str | None = None


class ForcedRollResult(BaseModel):
    character_id: uuid.UUID
    character_name: str
    ability: str
    roll: int
    modifier: int
    total: int
    dc: int
    success: bool
    label: str | None


class ConditionApply(BaseModel):
    campaign_id: uuid.UUID
    character_id: uuid.UUID
    condition_type: str
    duration_rounds: int | None = None
    source: str | None = None


class CharacterAdjust(BaseModel):
    hp_current: int | None = None
    hp_temp: int | None = None
    hp_max: int | None = None
    ac: int | None = None


# Combat Endpoints
@router.post("/combat/start", response_model=CombatResponse)
async def start_combat(
    data: CombatStart,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Start combat in a campaign (DM only)."""
    campaign = await verify_dm(data.campaign_id, current_user, db)
    
    # Check if combat already exists
    existing = await db.execute(
        select(Combat).where(Combat.campaign_id == campaign.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Combat already active")
    
    # Create combat
    combat = Combat(campaign_id=campaign.id)
    db.add(combat)
    await db.flush()
    
    # Add participants and roll initiative
    participants_data = []
    for i, p in enumerate(data.participants):
        # Get character for initiative modifier
        dex_mod = 0
        name = p.get("name", f"Participant {i+1}")
        
        if p.get("character_id"):
            char_result = await db.execute(
                select(Character).where(Character.id == uuid.UUID(p["character_id"]))
            )
            char = char_result.scalar_one_or_none()
            if char:
                name = char.name
                dex_mod = (char.ability_scores.get("dex", 10) - 10) // 2
        
        initiative = random.randint(1, 20) + dex_mod
        
        participant = CombatParticipant(
            combat_id=combat.id,
            character_id=uuid.UUID(p["character_id"]) if p.get("character_id") else None,
            name=name,
            initiative=initiative,
            turn_order=0,  # Will be set after sorting
            is_npc=p.get("is_npc", False),
        )
        db.add(participant)
        participants_data.append({"name": name, "initiative": initiative, "participant": participant})
    
    await db.flush()
    
    # Sort by initiative and set turn order
    participants_data.sort(key=lambda x: x["initiative"], reverse=True)
    for i, pd in enumerate(participants_data):
        pd["participant"].turn_order = i
    
    await db.flush()
    
    # Log combat start
    log = GameLog(
        campaign_id=campaign.id,
        user_id=current_user.id,
        action_type="combat_start",
        data={"participants": [{"name": p["name"], "initiative": p["initiative"]} for p in participants_data]},
    )
    db.add(log)
    
    await db.refresh(combat)
    
    return CombatResponse(
        id=combat.id,
        campaign_id=combat.campaign_id,
        current_round=combat.current_round,
        current_turn_index=combat.current_turn_index,
        is_active=combat.is_active,
        participants=[
            {"name": p["name"], "initiative": p["initiative"], "turn_order": i}
            for i, p in enumerate(participants_data)
        ],
    )


@router.post("/combat/end")
async def end_combat(
    campaign_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """End combat in a campaign (DM only)."""
    campaign = await verify_dm(campaign_id, current_user, db)
    
    result = await db.execute(
        select(Combat).where(Combat.campaign_id == campaign.id)
    )
    combat = result.scalar_one_or_none()
    
    if not combat:
        raise HTTPException(status_code=404, detail="No active combat")
    
    # Delete participants and combat
    await db.execute(delete(CombatParticipant).where(CombatParticipant.combat_id == combat.id))
    await db.delete(combat)
    
    # Log combat end
    log = GameLog(
        campaign_id=campaign.id,
        user_id=current_user.id,
        action_type="combat_end",
        data={},
    )
    db.add(log)
    
    return {"status": "combat ended"}


@router.post("/combat/next-turn")
async def next_turn(
    campaign_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Advance to next turn (DM only)."""
    campaign = await verify_dm(campaign_id, current_user, db)
    
    result = await db.execute(
        select(Combat)
        .options(selectinload(Combat.participants))
        .where(Combat.campaign_id == campaign.id)
    )
    combat = result.scalar_one_or_none()
    
    if not combat:
        raise HTTPException(status_code=404, detail="No active combat")
    
    # Advance turn
    combat.current_turn_index += 1
    if combat.current_turn_index >= len(combat.participants):
        combat.current_turn_index = 0
        combat.current_round += 1
    
    current_participant = combat.participants[combat.current_turn_index]
    
    # Log turn change
    log = GameLog(
        campaign_id=campaign.id,
        user_id=current_user.id,
        action_type="turn_start",
        data={"round": combat.current_round, "participant": current_participant.name},
    )
    db.add(log)
    
    return {
        "round": combat.current_round,
        "turn_index": combat.current_turn_index,
        "current_participant": current_participant.name,
    }


# Forced Rolls
@router.post("/save-throw", response_model=ForcedRollResult)
async def force_saving_throw(
    data: ForcedRollRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Force a saving throw (DM only)."""
    await verify_dm(data.campaign_id, current_user, db)
    
    result = await db.execute(
        select(Character).where(Character.id == data.character_id)
    )
    character = result.scalar_one_or_none()
    
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    # Calculate modifier
    ability_score = character.ability_scores.get(data.ability, 10)
    modifier = (ability_score - 10) // 2
    
    # Roll
    roll = random.randint(1, 20)
    total = roll + modifier
    success = total >= data.dc
    
    # Log
    log = GameLog(
        campaign_id=data.campaign_id,
        user_id=current_user.id,
        action_type="saving_throw",
        data={
            "character": character.name,
            "ability": data.ability,
            "roll": roll,
            "modifier": modifier,
            "total": total,
            "dc": data.dc,
            "success": success,
            "label": data.label,
        },
    )
    db.add(log)
    
    return ForcedRollResult(
        character_id=character.id,
        character_name=character.name,
        ability=data.ability,
        roll=roll,
        modifier=modifier,
        total=total,
        dc=data.dc,
        success=success,
        label=data.label,
    )


@router.post("/ability-check", response_model=ForcedRollResult)
async def force_ability_check(
    data: ForcedRollRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Force an ability check (DM only)."""
    await verify_dm(data.campaign_id, current_user, db)
    
    result = await db.execute(
        select(Character).where(Character.id == data.character_id)
    )
    character = result.scalar_one_or_none()
    
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    ability_score = character.ability_scores.get(data.ability, 10)
    modifier = (ability_score - 10) // 2
    roll = random.randint(1, 20)
    total = roll + modifier
    success = total >= data.dc
    
    log = GameLog(
        campaign_id=data.campaign_id,
        user_id=current_user.id,
        action_type="ability_check",
        data={
            "character": character.name,
            "ability": data.ability,
            "roll": roll,
            "modifier": modifier,
            "total": total,
            "dc": data.dc,
            "success": success,
            "label": data.label,
        },
    )
    db.add(log)
    
    return ForcedRollResult(
        character_id=character.id,
        character_name=character.name,
        ability=data.ability,
        roll=roll,
        modifier=modifier,
        total=total,
        dc=data.dc,
        success=success,
        label=data.label,
    )


# Conditions
@router.post("/condition/apply")
async def apply_condition(
    data: ConditionApply,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Apply a condition to a character (DM only)."""
    await verify_dm(data.campaign_id, current_user, db)
    
    if data.condition_type not in CONDITION_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid condition. Valid: {CONDITION_TYPES}")
    
    result = await db.execute(
        select(Character).where(Character.id == data.character_id)
    )
    character = result.scalar_one_or_none()
    
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    condition = CharacterCondition(
        character_id=character.id,
        condition_type=data.condition_type,
        duration_rounds=data.duration_rounds,
        source=data.source,
    )
    db.add(condition)
    
    log = GameLog(
        campaign_id=data.campaign_id,
        user_id=current_user.id,
        action_type="condition_applied",
        data={
            "character": character.name,
            "condition": data.condition_type,
            "duration": data.duration_rounds,
            "source": data.source,
        },
    )
    db.add(log)
    
    return {"status": "condition applied", "condition": data.condition_type}


@router.delete("/condition/{condition_id}")
async def remove_condition(
    condition_id: uuid.UUID,
    campaign_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Remove a condition from a character (DM only)."""
    await verify_dm(campaign_id, current_user, db)
    
    result = await db.execute(
        select(CharacterCondition).where(CharacterCondition.id == condition_id)
    )
    condition = result.scalar_one_or_none()
    
    if not condition:
        raise HTTPException(status_code=404, detail="Condition not found")
    
    await db.delete(condition)
    
    return {"status": "condition removed"}


# Character adjustments
@router.patch("/character/{character_id}")
async def adjust_character(
    character_id: uuid.UUID,
    campaign_id: uuid.UUID,
    data: CharacterAdjust,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Adjust character HP/AC (DM only)."""
    await verify_dm(campaign_id, current_user, db)
    
    result = await db.execute(
        select(Character).where(Character.id == character_id)
    )
    character = result.scalar_one_or_none()
    
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    
    update_data = data.model_dump(exclude_unset=True)
    changes = {}
    
    for field, value in update_data.items():
        old_value = getattr(character, field)
        setattr(character, field, value)
        changes[field] = {"old": old_value, "new": value}
    
    if changes:
        log = GameLog(
            campaign_id=campaign_id,
            user_id=current_user.id,
            action_type="character_update",
            data={"character": character.name, "changes": changes},
        )
        db.add(log)
    
    return {"status": "updated", "changes": changes}
