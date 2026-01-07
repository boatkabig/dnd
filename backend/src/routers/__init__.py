from .auth import router as auth_router
from .campaigns import router as campaigns_router
from .characters import router as characters_router
from .dice import router as dice_router
from .srd import router as srd_router
from .dm_control import router as dm_control_router
from .equipment import router as equipment_router

__all__ = [
    "auth_router",
    "campaigns_router",
    "characters_router",
    "dice_router",
    "srd_router",
    "dm_control_router",
    "equipment_router",
]

