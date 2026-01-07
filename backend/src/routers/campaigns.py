from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.db import get_db
from src.models import Campaign, Character, User
from src.routers.auth import get_current_user

router = APIRouter()


# Schemas
class CampaignCreate(BaseModel):
    name: str
    description: str | None = None
    settings: dict = {}


class CampaignResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    dm_id: uuid.UUID
    invite_code: str
    settings: dict

    class Config:
        from_attributes = True


class CampaignJoin(BaseModel):
    invite_code: str


class CharacterSummary(BaseModel):
    id: uuid.UUID
    name: str
    class_key: str | None
    race_key: str | None
    level: int

    class Config:
        from_attributes = True


class CampaignDetail(CampaignResponse):
    characters: list[CharacterSummary] = []


# Endpoints
@router.get("/", response_model=list[CampaignResponse])
async def list_campaigns(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List campaigns where user is DM or has a character."""
    # Campaigns as DM
    dm_result = await db.execute(
        select(Campaign).where(Campaign.dm_id == current_user.id)
    )
    dm_campaigns = list(dm_result.scalars().all())
    
    # Campaigns with characters
    char_result = await db.execute(
        select(Campaign)
        .join(Character)
        .where(Character.user_id == current_user.id)
    )
    player_campaigns = list(char_result.scalars().all())
    
    # Combine and deduplicate
    all_campaigns = {c.id: c for c in dm_campaigns + player_campaigns}
    return list(all_campaigns.values())


@router.post("/", response_model=CampaignResponse)
async def create_campaign(
    campaign_data: CampaignCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new campaign (user becomes DM)."""
    campaign = Campaign(
        name=campaign_data.name,
        description=campaign_data.description,
        dm_id=current_user.id,
        settings=campaign_data.settings,
    )
    db.add(campaign)
    await db.flush()
    await db.refresh(campaign)
    return campaign


@router.get("/{campaign_id}", response_model=CampaignDetail)
async def get_campaign(
    campaign_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get campaign details."""
    result = await db.execute(
        select(Campaign)
        .options(selectinload(Campaign.characters))
        .where(Campaign.id == campaign_id)
    )
    campaign = result.scalar_one_or_none()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Check if user has access
    has_access = campaign.dm_id == current_user.id or any(
        c.user_id == current_user.id for c in campaign.characters
    )
    if not has_access:
        raise HTTPException(status_code=403, detail="No access to this campaign")
    
    return campaign


@router.post("/{campaign_id}/join", response_model=CampaignResponse)
async def join_campaign(
    campaign_id: uuid.UUID,
    join_data: CampaignJoin,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Join a campaign using invite code."""
    result = await db.execute(
        select(Campaign).where(
            (Campaign.id == campaign_id) & (Campaign.invite_code == join_data.invite_code)
        )
    )
    campaign = result.scalar_one_or_none()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found or invalid invite code")
    
    return campaign


@router.post("/{campaign_id}/regenerate-invite", response_model=CampaignResponse)
async def regenerate_invite(
    campaign_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Regenerate invite code (DM only)."""
    import secrets
    
    result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id)
    )
    campaign = result.scalar_one_or_none()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if campaign.dm_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only DM can regenerate invite code")
    
    campaign.invite_code = secrets.token_urlsafe(8)
    await db.flush()
    await db.refresh(campaign)
    return campaign
