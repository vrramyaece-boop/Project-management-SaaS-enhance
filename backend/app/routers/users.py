# app/routers/users.py
# Users router — user profile management and personal analytics dashboard.

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import crud, models, schemas
from app.auth import get_current_active_user

router = APIRouter()


@router.get("/me", response_model=schemas.User)
def read_user_me(current_user: models.User = Depends(get_current_active_user)):
    """
    Return the current user's own profile.

    Used by the frontend to display account details on the dashboard.
    Does not expose hashed_password or refresh_token.
    """
    return current_user


@router.put("/me", response_model=schemas.User)
def update_user_me(
    user_update: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Update the current user's own profile (email, is_active, etc.).

    Only the fields included in the request body are updated.
    Fields not provided are left unchanged (partial update via exclude_unset).
    """
    updated_user = crud.update_user(db, current_user.id, user_update)
    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")
    return updated_user


@router.get("/dashboard", response_model=schemas.UserDashboard)
def user_dashboard(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get the personal analytics dashboard for the current user.

    Returns:
      - total_projects      : how many projects they own
      - active_subscription : True if they have an active subscription
      - subscription_plan   : 'free' or 'pro'
      - team_member_count   : how many people are in teams they own
      - recent_activity     : last 10 project actions across their projects

    This endpoint is called when the user opens their Dashboard page.
    The UserDashboardPage.jsx displays all this data in summary cards.
    """
    return crud.get_user_dashboard(db, current_user.id)
