from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db
from src.models import SRDClass, SRDRace, SRDSpell, SRDMonster, SRDTrinket, SRDBackground, Translation

router = APIRouter()


async def get_translation(
    db: AsyncSession,
    entity_type: str,
    entity_key: str,
    lang: str,
    field: str,
) -> str | None:
    """Get translation for an entity field."""
    result = await db.execute(
        select(Translation.value).where(
            and_(
                Translation.entity_type == entity_type,
                Translation.entity_key == entity_key,
                Translation.lang == lang,
                Translation.field == field,
            )
        )
    )
    row = result.scalar_one_or_none()
    return row


async def add_translations(db: AsyncSession, item: dict, entity_type: str, key: str, lang: str) -> dict:
    """Add translated name and description to item."""
    result = item.copy()
    
    name = await get_translation(db, entity_type, key, lang, "name")
    if name:
        result["name"] = name
    else:
        result["name"] = key.replace("_", " ").title()
    
    desc = await get_translation(db, entity_type, key, lang, "description")
    if desc:
        result["description"] = desc
    
    return result


@router.get("/classes")
async def list_classes(
    db: Annotated[AsyncSession, Depends(get_db)],
    lang: str = Query("en", description="Language code (en, th)"),
):
    """List all character classes with translations."""
    result = await db.execute(select(SRDClass))
    classes = result.scalars().all()
    
    items = []
    for c in classes:
        item = {
            "key": c.key,
            "hit_die": c.hit_die,
            "primary_ability": c.primary_ability,
            "saving_throw_proficiencies": c.saving_throw_proficiencies,
        }
        item = await add_translations(db, item, "class", c.key, lang)
        items.append(item)
    
    return items


@router.get("/races")
async def list_races(
    db: Annotated[AsyncSession, Depends(get_db)],
    lang: str = Query("en"),
):
    """List all races/species with translations."""
    result = await db.execute(select(SRDRace))
    races = result.scalars().all()
    
    items = []
    for r in races:
        item = {
            "key": r.key,
            "speed": r.speed,
            "size": r.size,
            "ability_bonuses": r.ability_bonuses,
        }
        item = await add_translations(db, item, "race", r.key, lang)
        items.append(item)
    
    return items


@router.get("/spells")
async def list_spells(
    db: Annotated[AsyncSession, Depends(get_db)],
    lang: str = Query("en"),
    level: int | None = Query(None, description="Filter by spell level (0 for cantrips)"),
    school: str | None = Query(None),
    class_key: str | None = Query(None, description="Filter by class"),
):
    """List spells with translations and filters."""
    query = select(SRDSpell)
    
    if level is not None:
        query = query.where(SRDSpell.level == level)
    if school:
        query = query.where(SRDSpell.school == school)
    
    result = await db.execute(query)
    spells = result.scalars().all()
    
    items = []
    for s in spells:
        if class_key and class_key not in s.classes:
            continue
        
        item = {
            "key": s.key,
            "level": s.level,
            "school": s.school,
            "casting_time": s.casting_time,
            "range": s.range,
            "duration": s.duration,
            "components": s.components,
            "classes": s.classes,
        }
        item = await add_translations(db, item, "spell", s.key, lang)
        items.append(item)
    
    return items


@router.get("/monsters")
async def list_monsters(
    db: Annotated[AsyncSession, Depends(get_db)],
    lang: str = Query("en"),
    type: str | None = Query(None),
    cr: str | None = Query(None, description="Challenge rating"),
):
    """List monsters with translations and filters."""
    query = select(SRDMonster)
    
    if type:
        query = query.where(SRDMonster.type == type)
    if cr:
        query = query.where(SRDMonster.challenge_rating == cr)
    
    result = await db.execute(query)
    monsters = result.scalars().all()
    
    items = []
    for m in monsters:
        item = {
            "key": m.key,
            "size": m.size,
            "type": m.type,
            "challenge_rating": m.challenge_rating,
            "armor_class": m.armor_class,
            "hit_points": m.hit_points,
            "speed": m.speed,
            "ability_scores": m.ability_scores,
        }
        item = await add_translations(db, item, "monster", m.key, lang)
        items.append(item)
    
    return items


@router.get("/trinkets")
async def list_trinkets(
    db: Annotated[AsyncSession, Depends(get_db)],
    lang: str = Query("en"),
):
    """List all 100 trinkets with translations."""
    result = await db.execute(select(SRDTrinket).order_by(SRDTrinket.roll_number))
    trinkets = result.scalars().all()
    
    items = []
    for t in trinkets:
        item = {"roll": t.roll_number}
        item = await add_translations(db, item, "trinket", str(t.roll_number), lang)
        items.append(item)
    
    return items


@router.get("/backgrounds")
async def list_backgrounds(
    db: Annotated[AsyncSession, Depends(get_db)],
    lang: str = Query("en"),
):
    """List all backgrounds with translations."""
    result = await db.execute(select(SRDBackground))
    backgrounds = result.scalars().all()
    
    items = []
    for b in backgrounds:
        item = {
            "key": b.key,
            "skill_proficiencies": b.skill_proficiencies,
            "tool_proficiencies": b.tool_proficiencies,
            "equipment": b.equipment,
        }
        item = await add_translations(db, item, "background", b.key, lang)
        items.append(item)
    
    return items
