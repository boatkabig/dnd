"""Integration tests for campaign endpoints."""

import pytest
from httpx import AsyncClient


async def get_auth_header(client: AsyncClient, username: str = "testdm") -> dict:
    """Helper to register, login and get auth header."""
    await client.post("/api/auth/register", json={
        "username": username,
        "email": f"{username}@example.com",
        "password": "password123",
    })
    
    login_response = await client.post("/api/auth/login", data={
        "username": username,
        "password": "password123",
    })
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
class TestCampaignEndpoints:
    """Integration tests for /api/campaigns endpoints."""
    
    async def test_create_campaign(self, client: AsyncClient):
        """Test creating a new campaign."""
        headers = await get_auth_header(client)
        
        response = await client.post("/api/campaigns/", json={
            "name": "Dragon's Lair",
            "description": "An epic adventure",
        }, headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Dragon's Lair"
        assert data["description"] == "An epic adventure"
        assert "invite_code" in data
        assert len(data["invite_code"]) > 0
    
    async def test_list_campaigns(self, client: AsyncClient):
        """Test listing user's campaigns."""
        headers = await get_auth_header(client, "listdm")
        
        # Create two campaigns
        await client.post("/api/campaigns/", json={"name": "Campaign 1"}, headers=headers)
        await client.post("/api/campaigns/", json={"name": "Campaign 2"}, headers=headers)
        
        response = await client.get("/api/campaigns/", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
    
    async def test_get_campaign_detail(self, client: AsyncClient):
        """Test getting campaign details."""
        headers = await get_auth_header(client, "detaildm")
        
        create_response = await client.post("/api/campaigns/", json={
            "name": "Detail Campaign",
        }, headers=headers)
        campaign_id = create_response.json()["id"]
        
        response = await client.get(f"/api/campaigns/{campaign_id}", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Detail Campaign"
        assert "characters" in data
    
    async def test_join_campaign(self, client: AsyncClient):
        """Test joining a campaign with invite code."""
        # DM creates campaign
        dm_headers = await get_auth_header(client, "joindm")
        create_response = await client.post("/api/campaigns/", json={
            "name": "Joinable Campaign",
        }, headers=dm_headers)
        campaign_id = create_response.json()["id"]
        invite_code = create_response.json()["invite_code"]
        
        # Player joins
        player_headers = await get_auth_header(client, "joinplayer")
        response = await client.post(
            f"/api/campaigns/{campaign_id}/join",
            json={"invite_code": invite_code},
            headers=player_headers
        )
        
        assert response.status_code == 200
    
    async def test_campaign_not_found(self, client: AsyncClient):
        """Test getting non-existent campaign."""
        headers = await get_auth_header(client, "notfounddm")
        
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = await client.get(f"/api/campaigns/{fake_id}", headers=headers)
        
        assert response.status_code == 404
