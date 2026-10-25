from typing import Annotated

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, require_user

router = APIRouter(prefix="/api", tags=["auth"])


@router.get("/me", response_model=CurrentUser)
def me(user: Annotated[CurrentUser, Depends(require_user)]) -> CurrentUser:
    return user
