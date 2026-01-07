from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.core.config import get_settings
from src.routers import auth, campaigns, characters, dice, srd, dm_control, equipment

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    print("🎲 DND Backend starting up...")
    yield
    # Shutdown
    print("🎲 DND Backend shutting down...")


app = FastAPI(
    title="DND Virtual Tabletop API",
    description="API for DND 5e Virtual Tabletop Web Game",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(campaigns.router, prefix="/api/campaigns", tags=["Campaigns"])
app.include_router(characters.router, prefix="/api/characters", tags=["Characters"])
app.include_router(dice.router, prefix="/api/dice", tags=["Dice"])
app.include_router(srd.router, prefix="/api/srd", tags=["SRD"])
app.include_router(dm_control.router, prefix="/api/dm", tags=["DM Controls"])
app.include_router(equipment.router, prefix="/api/v1/equipment", tags=["Equipment"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "DND Virtual Tabletop API", "version": "0.1.0"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}
