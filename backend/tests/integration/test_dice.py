"""Integration tests for dice rolling endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestDiceEndpoints:
    """Integration tests for /api/dice endpoints."""
    
    async def test_roll_d20(self, client: AsyncClient):
        """Test rolling a d20."""
        response = await client.post("/api/dice/roll", json={
            "dice": "1d20",
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["dice"] == "1d20"
        assert len(data["rolls"]) == 1
        assert 1 <= data["rolls"][0] <= 20
        assert data["total"] == data["rolls"][0]
    
    async def test_roll_with_modifier(self, client: AsyncClient):
        """Test rolling with a modifier."""
        response = await client.post("/api/dice/roll", json={
            "dice": "1d20+5",
            "label": "Attack Roll",
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["modifier"] == 5
        assert data["total"] == data["rolls"][0] + 5
        assert data["label"] == "Attack Roll"
    
    async def test_roll_multiple_dice(self, client: AsyncClient):
        """Test rolling multiple dice."""
        response = await client.post("/api/dice/roll", json={
            "dice": "4d6",
        })
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["rolls"]) == 4
        assert data["total"] == sum(data["rolls"])
    
    async def test_roll_with_advantage(self, client: AsyncClient):
        """Test rolling with advantage."""
        response = await client.post("/api/dice/roll", json={
            "dice": "1d20",
            "advantage": True,
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["advantage"] is True
        assert data["original_rolls"] is not None
        assert len(data["original_rolls"]) == 2
        # Result should be the higher of the two
        assert data["rolls"][0] == max(data["original_rolls"])
    
    async def test_roll_with_disadvantage(self, client: AsyncClient):
        """Test rolling with disadvantage."""
        response = await client.post("/api/dice/roll", json={
            "dice": "1d20",
            "disadvantage": True,
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["disadvantage"] is True
        # Result should be the lower of the two
        assert data["rolls"][0] == min(data["original_rolls"])
    
    async def test_quick_roll(self, client: AsyncClient):
        """Test quick roll endpoint."""
        response = await client.get("/api/dice/quick/2d6+3")
        
        assert response.status_code == 200
        data = response.json()
        assert data["dice"] == "2d6+3"
        assert len(data["rolls"]) == 2
        assert data["modifier"] == 3
        assert data["total"] == sum(data["rolls"]) + 3
