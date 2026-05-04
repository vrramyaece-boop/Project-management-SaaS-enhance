# app/routers/notifications.py
# Notifications router — in-app notification system.
#
# Notifications are created automatically by other parts of the system:
#   - teams.py  : team invitation received / invitation accepted
#   - projects.py: project created/updated/deleted (for team members)
#   - admin.py  : system announcements
#
# This router only handles reading and marking notifications as read.

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app import crud, models, schemas
from app.auth import get_current_active_user, get_current_admin_user

router = APIRouter()


@router.get("/", response_model=List[schemas.Notification])
def read_notifications(
    skip: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=20, ge=1, le=100, description="Max notifications per page"),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Return notifications for the current user, newest first (paginated).

    The frontend uses this to populate the Notifications page.
    Pagination: default 20 per page, max 100.
    """
    return crud.get_notifications_for_user(db, current_user.id, skip=skip, limit=limit)


@router.get("/unread-count")
def get_unread_count(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Return the count of unread notifications for the current user.

    The Navbar calls this endpoint periodically to update the red badge number.
    The AuthContext in the frontend polls this every time the user navigates.

    Returns a simple dict: { "unread_count": N }
    """
    # Count directly in the DB using a filtered query (more efficient than loading all)
    unread = (
        db.query(models.Notification)
        .filter(
            models.Notification.user_id == current_user.id,
            models.Notification.is_read == False
        )
        .count()
    )
    return {"unread_count": unread}


@router.post("/mark-read/{notification_id}")
def mark_notification_read(
    notification_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Mark a single notification as read.

    Security: verifies the notification belongs to the current user
    so users cannot mark other users' notifications as read.
    """
    note = crud.mark_notification_as_read(db, notification_id)

    # Verify it belongs to this user
    if not note or note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")

    return {"message": "Notification marked as read"}


@router.post("/mark-read-all")
def mark_all_read(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Mark all of the current user's notifications as read at once.

    Uses a bulk UPDATE query instead of loading each notification
    individually (much faster when the user has many notifications).
    """
    crud.mark_all_notifications_as_read(db, current_user.id)
    return {"message": "All notifications marked as read"}


@router.post("/system")
def send_system_notification(
    title: str = Query(..., description="Notification title"),
    message: str = Query(..., description="Notification message body"),
    user_ids: Optional[List[int]] = Query(default=None, description="Specific user IDs, or omit to send to all"),
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Send a system notification to all users or a specific list of users (admin only).

    Use cases:
      - Announce scheduled maintenance
      - Notify users of a new feature
      - Send billing reminders to specific users

    If user_ids is provided: send only to those users.
    If user_ids is omitted or empty: broadcast to ALL active users.
    """
    if user_ids:
        # Send to specific users only
        for user_id in user_ids:
            crud.create_notification(
                db, user_id=user_id, title=title, message=message, type="system"
            )
        return {"message": f"System notification sent to {len(user_ids)} user(s)"}
    else:
        # Broadcast to all users
        users = crud.get_users(db, skip=0, limit=10000)  # get all users
        for user in users:
            crud.create_notification(
                db, user_id=user.id, title=title, message=message, type="system"
            )
        return {"message": f"System notification broadcast to {len(users)} user(s)"}
