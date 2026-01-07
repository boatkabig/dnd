"""Equipment API router for D&D 5e.

API Endpoints:
Master Data:
- GET  /api/v1/equipment              - List all SRD equipment
- GET  /api/v1/equipment/{id}         - Get specific equipment

Session Character Equipment:
- GET  /api/v1/sessions/{session_id}/characters/{character_id}/equipment
- POST /api/v1/sessions/{session_id}/characters/{character_id}/equipment
- PATCH /api/v1/sessions/{session_id}/characters/{character_id}/equipment/{equipment_id}
- DELETE /api/v1/sessions/{session_id}/characters/{character_id}/equipment/{equipment_id}
- GET  /api/v1/sessions/{session_id}/characters/{character_id}/equipment/capacity
- GET  /api/v1/sessions/{session_id}/characters/{character_id}/equipment/attunements
- POST /api/v1/sessions/{session_id}/characters/{character_id}/equipment/attunements
- DELETE /api/v1/sessions/{session_id}/characters/{character_id}/equipment/attunements/{equipment_id}
"""

from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.db import get_db
from src.models import SRDEquipment, Character

router = APIRouter()


# ============== Schemas ==============

class EquipmentResponse(BaseModel):
    """Equipment item from SRD master data."""
    id: UUID
    equipment_id: str = Field(..., description="Unique identifier")
    category: str = Field(..., description="weapon, armor, adventuring_gear, tool, magic_item")
    subcategory: Optional[str] = None
    weight: float = Field(..., description="Weight in pounds")
    cost_gp: float = Field(..., description="Cost in gold pieces")
    requires_attunement: bool = False
    rarity: Optional[str] = None
    properties: dict = Field(default_factory=dict)

    class Config:
        from_attributes = True


class InventoryItem(BaseModel):
    equipment_id: str
    quantity: int = 1
    equipped: bool = False


class InventoryResponse(BaseModel):
    items: list[InventoryItem] = []
    currency: dict = Field(default_factory=lambda: {"gp": 0, "sp": 0, "cp": 0})
    attunements: list[str] = []
    total_weight: float = 0.0


class AddItemRequest(BaseModel):
    equipment_id: str
    quantity: int = Field(1, ge=1)


class UpdateItemRequest(BaseModel):
    quantity: Optional[int] = Field(None, ge=0)
    equipped: Optional[bool] = None


class AttunementRequest(BaseModel):
    equipment_id: str


class CapacityResponse(BaseModel):
    current_weight: float
    max_capacity: float
    encumbered_at: float
    heavily_encumbered_at: float
    push_drag_lift: float
    is_encumbered: bool
    is_heavily_encumbered: bool
    size_multiplier: float


# ============== SRD Equipment (Master Data) ==============

@router.get("", response_model=list[EquipmentResponse])
async def list_equipment(
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """List all equipment from SRD master data."""
    query = select(SRDEquipment)
    if category:
        query = query.where(SRDEquipment.category == category)
    if subcategory:
        query = query.where(SRDEquipment.subcategory == subcategory)
    
    result = await db.execute(query.order_by(SRDEquipment.equipment_id).offset(offset).limit(limit))
    return result.scalars().all()


@router.get("/{equipment_id}", response_model=EquipmentResponse)
async def get_equipment(equipment_id: str, db: AsyncSession = Depends(get_db)):
    """Get specific equipment by ID."""
    result = await db.execute(
        select(SRDEquipment).where(SRDEquipment.equipment_id == equipment_id)
    )
    equipment = result.scalar_one_or_none()
    if not equipment:
        raise HTTPException(404, f"Equipment '{equipment_id}' not found")
    return equipment


# ============== Session Character Equipment ==============

@router.get("/sessions/{session_id}/characters/{character_id}/equipment", response_model=InventoryResponse)
async def get_character_equipment(
    session_id: UUID,
    character_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get character's equipment inventory."""
    character = await _get_character(character_id, db)
    inventory = character.equipment or {"items": [], "currency": {}, "attunements": []}
    
    # Calculate total weight
    total_weight = await _calculate_weight(inventory.get("items", []), db)
    
    return InventoryResponse(
        items=inventory.get("items", []),
        currency=inventory.get("currency", {}),
        attunements=inventory.get("attunements", []),
        total_weight=total_weight
    )


@router.post("/sessions/{session_id}/characters/{character_id}/equipment")
async def add_equipment(
    session_id: UUID,
    character_id: UUID,
    request: AddItemRequest,
    db: AsyncSession = Depends(get_db)
):
    """Add item to character's inventory."""
    await _validate_equipment(request.equipment_id, db)
    character = await _get_character(character_id, db)
    
    inventory = character.equipment or {"items": [], "currency": {}, "attunements": []}
    items = inventory.get("items", [])
    
    existing = next((i for i in items if i["equipment_id"] == request.equipment_id), None)
    if existing:
        existing["quantity"] += request.quantity
    else:
        items.append({"equipment_id": request.equipment_id, "quantity": request.quantity, "equipped": False})
    
    inventory["items"] = items
    character.equipment = inventory
    await db.commit()
    
    return {"message": f"Added {request.quantity}× {request.equipment_id}"}


@router.patch("/sessions/{session_id}/characters/{character_id}/equipment/{equipment_id}")
async def update_equipment(
    session_id: UUID,
    character_id: UUID,
    equipment_id: str,
    request: UpdateItemRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update item in inventory (quantity, equipped status)."""
    character = await _get_character(character_id, db)
    inventory = character.equipment or {"items": [], "currency": {}, "attunements": []}
    items = inventory.get("items", [])
    
    item = next((i for i in items if i["equipment_id"] == equipment_id), None)
    if not item:
        raise HTTPException(404, f"Item '{equipment_id}' not in inventory")
    
    if request.quantity is not None:
        if request.quantity <= 0:
            items.remove(item)
        else:
            item["quantity"] = request.quantity
    
    if request.equipped is not None:
        item["equipped"] = request.equipped
    
    inventory["items"] = items
    character.equipment = inventory
    await db.commit()
    
    return {"message": f"Updated {equipment_id}"}


@router.delete("/sessions/{session_id}/characters/{character_id}/equipment/{equipment_id}")
async def remove_equipment(
    session_id: UUID,
    character_id: UUID,
    equipment_id: str,
    quantity: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db)
):
    """Remove item from inventory."""
    character = await _get_character(character_id, db)
    inventory = character.equipment or {"items": [], "currency": {}, "attunements": []}
    items = inventory.get("items", [])
    
    item = next((i for i in items if i["equipment_id"] == equipment_id), None)
    if not item:
        raise HTTPException(404, f"Item '{equipment_id}' not in inventory")
    
    item["quantity"] -= quantity
    if item["quantity"] <= 0:
        items.remove(item)
    
    inventory["items"] = items
    character.equipment = inventory
    await db.commit()
    
    return {"message": f"Removed {quantity}× {equipment_id}"}


@router.get("/sessions/{session_id}/characters/{character_id}/equipment/capacity", response_model=CapacityResponse)
async def get_capacity(
    session_id: UUID,
    character_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Calculate carrying capacity (STR × 15 lbs)."""
    character = await _get_character(character_id, db)
    
    strength = character.ability_scores.get("str", 10) if character.ability_scores else 10
    size_mult = 1.0  # TODO: Get from race
    
    max_capacity = strength * 15 * size_mult
    encumbered_at = strength * 5 * size_mult
    heavily_encumbered_at = strength * 10 * size_mult
    
    inventory = character.equipment or {"items": []}
    current_weight = await _calculate_weight(inventory.get("items", []), db)
    
    return CapacityResponse(
        current_weight=current_weight,
        max_capacity=max_capacity,
        encumbered_at=encumbered_at,
        heavily_encumbered_at=heavily_encumbered_at,
        push_drag_lift=strength * 30 * size_mult,
        is_encumbered=current_weight > encumbered_at,
        is_heavily_encumbered=current_weight > heavily_encumbered_at,
        size_multiplier=size_mult
    )


# ============== Attunements ==============

@router.get("/sessions/{session_id}/characters/{character_id}/equipment/attunements")
async def get_attunements(
    session_id: UUID,
    character_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get character's attunements (max 3)."""
    character = await _get_character(character_id, db)
    attunements = (character.equipment or {}).get("attunements", [])
    return {"attunements": attunements, "slots_used": len(attunements), "slots_max": 3}


@router.post("/sessions/{session_id}/characters/{character_id}/equipment/attunements")
async def add_attunement(
    session_id: UUID,
    character_id: UUID,
    request: AttunementRequest,
    db: AsyncSession = Depends(get_db)
):
    """Attune to magic item (max 3)."""
    equipment = await _validate_equipment(request.equipment_id, db)
    if not equipment.requires_attunement:
        raise HTTPException(400, f"'{request.equipment_id}' does not require attunement")
    
    character = await _get_character(character_id, db)
    inventory = character.equipment or {"items": [], "currency": {}, "attunements": []}
    attunements = inventory.get("attunements", [])
    
    if request.equipment_id in attunements:
        raise HTTPException(400, "Already attuned")
    if len(attunements) >= 3:
        raise HTTPException(400, "Maximum 3 attunements")
    
    attunements.append(request.equipment_id)
    inventory["attunements"] = attunements
    character.equipment = inventory
    await db.commit()
    
    return {"message": f"Attuned to {request.equipment_id}", "attunements": attunements}


@router.delete("/sessions/{session_id}/characters/{character_id}/equipment/attunements/{equipment_id}")
async def remove_attunement(
    session_id: UUID,
    character_id: UUID,
    equipment_id: str,
    db: AsyncSession = Depends(get_db)
):
    """End attunement."""
    character = await _get_character(character_id, db)
    inventory = character.equipment or {"items": [], "currency": {}, "attunements": []}
    attunements = inventory.get("attunements", [])
    
    if equipment_id not in attunements:
        raise HTTPException(404, f"Not attuned to '{equipment_id}'")
    
    attunements.remove(equipment_id)
    inventory["attunements"] = attunements
    character.equipment = inventory
    await db.commit()
    
    return {"message": f"Ended attunement to {equipment_id}"}


# ============== Helpers ==============

async def _get_character(character_id: UUID, db: AsyncSession) -> Character:
    result = await db.execute(select(Character).where(Character.id == character_id))
    character = result.scalar_one_or_none()
    if not character:
        raise HTTPException(404, "Character not found")
    return character


async def _validate_equipment(equipment_id: str, db: AsyncSession) -> SRDEquipment:
    result = await db.execute(
        select(SRDEquipment).where(SRDEquipment.equipment_id == equipment_id)
    )
    equipment = result.scalar_one_or_none()
    if not equipment:
        raise HTTPException(404, f"Equipment '{equipment_id}' not found")
    return equipment


async def _calculate_weight(items: list, db: AsyncSession) -> float:
    total = 0.0
    for item in items:
        result = await db.execute(
            select(SRDEquipment).where(SRDEquipment.equipment_id == item["equipment_id"])
        )
        eq = result.scalar_one_or_none()
        if eq:
            total += eq.weight * item.get("quantity", 1)
    return total
