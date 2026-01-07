"""Integration tests for authentication endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestAuthEndpoints:
    """Integration tests for /api/auth endpoints."""
    
    async def test_register_success(self, client: AsyncClient):
        """Test successful user registration."""
        response = await client.post("/api/auth/register", json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "testpassword123",
            "preferred_lang": "en",
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["email"] == "test@example.com"
        assert data["preferred_lang"] == "en"
        assert "id" in data
        assert "password" not in data
        assert "password_hash" not in data
    
    async def test_register_duplicate_username(self, client: AsyncClient):
        """Test registration with duplicate username."""
        # First registration
        await client.post("/api/auth/register", json={
            "username": "duplicate",
            "email": "first@example.com",
            "password": "password123",
        })
        
        # Second registration with same username
        response = await client.post("/api/auth/register", json={
            "username": "duplicate",
            "email": "second@example.com",
            "password": "password123",
        })
        
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"]
    
    async def test_login_success(self, client: AsyncClient):
        """Test successful login."""
        # Register first
        await client.post("/api/auth/register", json={
            "username": "loginuser",
            "email": "login@example.com",
            "password": "mypassword",
        })
        
        # Login
        response = await client.post("/api/auth/login", data={
            "username": "loginuser",
            "password": "mypassword",
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
    
    async def test_login_wrong_password(self, client: AsyncClient):
        """Test login with wrong password."""
        await client.post("/api/auth/register", json={
            "username": "wrongpass",
            "email": "wrong@example.com",
            "password": "correctpassword",
        })
        
        response = await client.post("/api/auth/login", data={
            "username": "wrongpass",
            "password": "wrongpassword",
        })
        
        assert response.status_code == 401
    
    async def test_get_me_authenticated(self, client: AsyncClient):
        """Test getting current user info when authenticated."""
        # Register and login
        await client.post("/api/auth/register", json={
            "username": "meuser",
            "email": "me@example.com",
            "password": "password123",
        })
        
        login_response = await client.post("/api/auth/login", data={
            "username": "meuser",
            "password": "password123",
        })
        token = login_response.json()["access_token"]
        
        # Get me
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        assert response.json()["username"] == "meuser"
    
    async def test_get_me_unauthenticated(self, client: AsyncClient):
        """Test getting current user info without authentication."""
        response = await client.get("/api/auth/me")
        assert response.status_code == 401
