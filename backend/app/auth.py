from functools import lru_cache
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from .config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)


class CurrentUser(BaseModel):
    id: UUID


@lru_cache
def _jwks_client(supabase_url: str) -> jwt.PyJWKClient:
    # One client per project keeps Supabase's signing keys cached (refreshed hourly, or when a token
    # names an unknown key) instead of fetching them on every request.
    return jwt.PyJWKClient(f"{supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600, timeout=10)


def verify_access_token(token: str, settings: Settings) -> CurrentUser:
    try:
        # Supabase's published signing keys are fetched from the project's JWKS endpoint.
        # Only asymmetric JWTs are accepted; legacy shared-secret JWT projects need
        # an asymmetric signing key configured before this API can accept sessions.
        key = _jwks_client(settings.supabase_url).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            key.key,
            algorithms=["RS256", "ES256"],
            audience="authenticated",
            issuer=f"{settings.supabase_url}/auth/v1",
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
        if claims.get("role") != "authenticated":
            raise ValueError("unexpected role")
        return CurrentUser(id=UUID(claims["sub"]))
    except jwt.PyJWKClientConnectionError as exc:
        raise HTTPException(status_code=503, detail="Sign-in is temporarily unavailable. Please try again.") from exc
    except (jwt.PyJWTError, ValueError, TypeError, KeyError) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired access token") from exc


def require_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return verify_access_token(credentials.credentials, settings)
