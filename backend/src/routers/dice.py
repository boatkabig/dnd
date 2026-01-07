import random
from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter()


class DiceRollRequest(BaseModel):
    """Request for rolling dice."""
    dice: str  # e.g., "1d20", "2d6+5", "4d6kh3" (keep highest 3)
    advantage: bool = False
    disadvantage: bool = False
    label: str | None = None  # e.g., "Attack Roll", "Fireball Damage"


class DiceRollResult(BaseModel):
    """Result of a dice roll."""
    dice: str
    rolls: list[int]
    modifier: int
    total: int
    label: str | None
    advantage: bool
    disadvantage: bool
    original_rolls: list[int] | None = None  # For advantage/disadvantage


def parse_dice(dice_str: str) -> tuple[int, int, int, str | None]:
    """
    Parse dice notation like "2d6+5" or "4d6kh3".
    Returns (count, sides, modifier, special).
    """
    import re
    
    # Match patterns like "2d6", "1d20+5", "4d6kh3"
    pattern = r"(\d+)d(\d+)(?:([+-]\d+))?(?:(kh|kl)(\d+))?"
    match = re.match(pattern, dice_str.lower().replace(" ", ""))
    
    if not match:
        raise ValueError(f"Invalid dice notation: {dice_str}")
    
    count = int(match.group(1))
    sides = int(match.group(2))
    modifier = int(match.group(3)) if match.group(3) else 0
    special = None
    
    if match.group(4):
        special = f"{match.group(4)}{match.group(5)}"
    
    return count, sides, modifier, special


def roll_dice(count: int, sides: int) -> list[int]:
    """Roll dice and return individual results."""
    return [random.randint(1, sides) for _ in range(count)]


@router.post("/roll", response_model=DiceRollResult)
async def roll(request: DiceRollRequest):
    """
    Roll dice with optional advantage/disadvantage.
    
    Dice notation:
    - "1d20" - Roll one d20
    - "2d6+5" - Roll 2d6 and add 5
    - "4d6kh3" - Roll 4d6, keep highest 3
    """
    count, sides, modifier, special = parse_dice(request.dice)
    
    if request.advantage and request.disadvantage:
        # They cancel out, just roll normally
        rolls = roll_dice(count, sides)
        original_rolls = None
    elif request.advantage and sides == 20 and count == 1:
        # Roll twice, take higher
        roll1 = roll_dice(1, 20)[0]
        roll2 = roll_dice(1, 20)[0]
        original_rolls = [roll1, roll2]
        rolls = [max(roll1, roll2)]
    elif request.disadvantage and sides == 20 and count == 1:
        # Roll twice, take lower
        roll1 = roll_dice(1, 20)[0]
        roll2 = roll_dice(1, 20)[0]
        original_rolls = [roll1, roll2]
        rolls = [min(roll1, roll2)]
    else:
        rolls = roll_dice(count, sides)
        original_rolls = None
    
    # Handle keep highest/lowest
    if special:
        keep_count = int(special[2:])
        if special.startswith("kh"):
            rolls = sorted(rolls, reverse=True)[:keep_count]
        elif special.startswith("kl"):
            rolls = sorted(rolls)[:keep_count]
    
    total = sum(rolls) + modifier
    
    return DiceRollResult(
        dice=request.dice,
        rolls=rolls,
        modifier=modifier,
        total=total,
        label=request.label,
        advantage=request.advantage,
        disadvantage=request.disadvantage,
        original_rolls=original_rolls,
    )


@router.get("/quick/{dice}")
async def quick_roll(dice: str):
    """Quick roll without extra options."""
    count, sides, modifier, special = parse_dice(dice)
    rolls = roll_dice(count, sides)
    
    if special:
        keep_count = int(special[2:])
        if special.startswith("kh"):
            rolls = sorted(rolls, reverse=True)[:keep_count]
        elif special.startswith("kl"):
            rolls = sorted(rolls)[:keep_count]
    
    return {
        "dice": dice,
        "rolls": rolls,
        "modifier": modifier,
        "total": sum(rolls) + modifier,
    }
