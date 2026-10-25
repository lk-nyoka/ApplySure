import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")

from fastapi.testclient import TestClient

from app import auth
from app.config import Settings, get_settings
from app.main import app


def test_public_health_and_protected_me():
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_url="https://example.supabase.co")
    try:
        client = TestClient(app)
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/api/me").status_code == 401
        response = client.get("/api/me", headers={"Authorization": "Bearer invalid"})
        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid or expired access token"}
    finally:
        app.dependency_overrides.clear()


def test_verified_token_claims(monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    class SigningKey:
        key = private_key.public_key()
    monkeypatch.setattr(auth.jwt.PyJWKClient, "get_signing_key_from_jwt", lambda self, token: SigningKey())
    settings = Settings(supabase_url="https://example.supabase.co")
    user_id = str(uuid4())
    claims = {
        "sub": user_id,
        "aud": "authenticated",
        "role": "authenticated",
        "iss": "https://example.supabase.co/auth/v1",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    valid = jwt.encode(claims, private_key, algorithm="RS256")
    assert str(auth.verify_access_token(valid, settings).id) == user_id

    from fastapi import HTTPException
    import pytest
    for changed in (
        {"aud": "wrong"},
        {"iss": "https://other.example/auth/v1"},
        {"exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
    ):
        token = jwt.encode({**claims, **changed}, private_key, algorithm="RS256")
        with pytest.raises(HTTPException) as error:
            auth.verify_access_token(token, settings)
        assert error.value.status_code == 401

    another_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = jwt.encode(claims, another_key, algorithm="RS256")
    with pytest.raises(HTTPException) as error:
        auth.verify_access_token(forged, settings)
    assert error.value.status_code == 401
