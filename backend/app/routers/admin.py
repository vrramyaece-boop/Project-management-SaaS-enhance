# app/routers/admin.py
# Admin router — platform management endpoints (admin role required).
#
# All routes here use get_current_admin_user as a dependency,
# which automatically raises HTTP 403 if the user is not an admin.
#
# Endpoints:
#   GET  /admin/users                     — list all users (paginated)
#   GET  /admin/subscriptions             — list all subscriptions (paginated)
#   GET  /admin/dashboard                 — platform analytics (cached 5 min)
#   GET  /admin/teams                     — list ALL teams on the platform
#   GET  /admin/teams/{team_id}/members   — list all members of any team
#   DELETE /admin/teams/{team_id}/members/{member_id} — remove a member (moderation)

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app import crud, models, schemas
from app.auth import get_current_admin_user
from app.cache import get_cached, set_cached, invalidate_cache

router = APIRouter()


# ── Users ──────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[schemas.User])
def read_users(
    skip: int = Query(default=0, ge=0, description="Pagination offset (0 = first page)"),
    limit: int = Query(default=20, ge=1, le=100, description="Max records per page (max 100)"),
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Get a paginated list of ALL registered users (admin only).

    Pagination example:
      Page 1: GET /admin/users?skip=0&limit=20   → users 1–20
      Page 2: GET /admin/users?skip=20&limit=20  → users 21–40

    Max 100 users per request to prevent overloading the response.
    """
    return crud.get_users(db, skip=skip, limit=limit)


# ── Subscriptions ──────────────────────────────────────────────────────────────

@router.get("/subscriptions", response_model=list[schemas.Subscription])
def read_subscriptions(
    skip: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=20, ge=1, le=100, description="Max records per page"),
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Get a paginated list of ALL subscriptions (admin only).

    Shows which users are on free vs pro plans.
    """
    return crud.get_subscriptions(db, skip=skip, limit=limit)


# ── Dashboard (cached) ─────────────────────────────────────────────────────────

@router.get("/dashboard")
def admin_dashboard(
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Get admin analytics dashboard data including team count (admin only).

    Returns platform-wide stats:
      - total_users         : all registered accounts
      - free_plan_count     : users on the free plan
      - pro_plan_count      : users on the pro plan
      - active_subscriptions: currently active subscriptions
      - monthly_registrations: signup counts per month (for chart)
      - total_teams         : total number of teams created on the platform

    Result is CACHED for 5 minutes. The cache is invalidated automatically
    when new users register (in auth.py) so stats don't go stale too long.
    """
    # Return cached result if available (avoids expensive DB aggregations)
    cached = get_cached("admin_dashboard")
    if cached:
        return cached

    # Cache miss — run database queries
    result = crud.get_admin_dashboard(db)

    # Add total_teams count to the dashboard data
    result["total_teams"] = crud.get_team_count(db)

    # Cache the result for 5 minutes (300 seconds)
    set_cached("admin_dashboard", result, ttl_seconds=300)

    return result


# ── Teams (Admin View) ─────────────────────────────────────────────────────────

@router.get("/teams")
def read_all_teams(
    skip: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=20, ge=1, le=100, description="Max teams per page"),
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Get ALL teams on the platform (admin only, paginated).

    Unlike the user endpoint (GET /teams) which only returns the current
    user's teams, this returns EVERY team on the platform for oversight.

    Each team object includes:
      - id, name, owner_id, created_at
      - member_count: number of members in that team
      - owner_email : email of the team owner

    Admins use this to monitor team activity and identify inactive teams.
    """
    teams = crud.get_all_teams(db, skip=skip, limit=limit)

    # Build enriched response with owner email and member count
    result = []
    for team in teams:
        # Load the owner user to get their email
        owner = crud.get_user(db, team.owner_id)
        member_count = crud.get_team_member_count(db, team.id)
        result.append({
            "id": team.id,
            "name": team.name,
            "owner_id": team.owner_id,
            "owner_email": owner.email if owner else "unknown",
            "member_count": member_count,
            "created_at": team.created_at,
        })

    return result


@router.get("/teams/{team_id}/members")
def read_team_members_admin(
    team_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Get all members of a specific team (admin only).

    Unlike GET /teams/{team_id}/members (which requires the user to be
    a member of the team), this endpoint lets admins inspect ANY team's
    members for moderation and oversight purposes.

    Returns each member with:
      - id        : TeamMember.id
      - user_id   : the user's ID
      - user_email: the user's email address
      - role      : 'owner' or 'member'
      - joined_at : when they joined
    """
    # Verify the team exists first
    team = crud.get_team(db, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Load owner details
    owner = crud.get_user(db, team.owner_id)

    # Load all members with their user details (joined query)
    rows = crud.get_all_team_members(db, team_id)

    members = []
    for membership, user in rows:
        members.append({
            "id": membership.id,
            "user_id": membership.user_id,
            "user_email": user.email,
            "role": membership.role,
            "joined_at": membership.invited_at,
        })

    return {
        "team_id": team_id,
        "team_name": team.name,
        "owner_id": team.owner_id,
        "owner_email": owner.email if owner else "unknown",
        "total_members": len(members),
        "members": members,
    }


@router.delete("/teams/{team_id}/members/{member_id}")
def remove_team_member_admin(
    team_id: int,
    member_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Remove a member from any team (admin moderation, admin only).

    Unlike DELETE /teams/{team_id}/members/{member_id} (owner only),
    admins can remove any member from any team for moderation purposes.

    Use cases:
      - Remove a user who is abusing a team
      - Clean up teams before deleting a user account
    """
    team = crud.get_team(db, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    removed = crud.admin_delete_team_member(db, team_id=team_id, member_id=member_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Team member not found")

    return {"message": "Team member removed successfully by admin"}


# ── System Notifications (Admin Broadcast) ─────────────────────────────────────

@router.post("/notifications/broadcast")
def broadcast_system_notification(
    payload: schemas.AdminNotificationBroadcast,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Send a system notification to all users or specific users (admin only).

    Use cases:
      - Announce platform maintenance windows
      - Notify users about new features
      - Send targeted billing reminders

    payload.title   : notification heading
    payload.message : notification body text
    payload.user_ids: optional list of specific user IDs.
                      If empty or omitted, broadcast to ALL active users.

    type is always 'system' for admin-sent notifications so users
    can filter them in the UI (purple badge).
    """
    if payload.user_ids:
        # Send to specific users only
        sent_count = 0
        for user_id in payload.user_ids:
            user = crud.get_user(db, user_id)
            if user:  # skip if user_id doesn't exist
                crud.create_notification(
                    db,
                    user_id=user_id,
                    title=payload.title,
                    message=payload.message,
                    type="system"
                )
                sent_count += 1
        return {
            "message": f"System notification sent to {sent_count} user(s)",
            "recipients": sent_count
        }
    else:
        # Broadcast to all active users
        users = crud.get_users(db, skip=0, limit=100000)
        for user in users:
            crud.create_notification(
                db,
                user_id=user.id,
                title=payload.title,
                message=payload.message,
                type="system"
            )
        return {
            "message": f"System notification broadcast to {len(users)} user(s)",
            "recipients": len(users)
        }
