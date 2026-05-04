# app/crud.py
# CRUD (Create, Read, Update, Delete) operations for all database models.
#
# This is the DATA LAYER — all direct database queries live here.
# Routers call these functions instead of writing SQL directly.
# This makes testing easier and keeps business logic out of database code.

from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from app import models, schemas
from app.auth import get_password_hash, verify_password


# ── User CRUD ─────────────────────────────────────────────────────────────────

def get_user(db: Session, user_id: int):
    """Get a single user by their primary key (ID)."""
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_user_by_email(db: Session, email: str):
    """
    Get a user by their email address.
    Used during login and registration to check if the email exists.
    The email column has an index so this query is fast even with many users.
    """
    return db.query(models.User).filter(models.User.email == email).first()


def get_user_by_stripe_customer_id(db: Session, stripe_customer_id: str):
    """Get a user by their Stripe customer ID (used in Stripe webhook handlers)."""
    return db.query(models.User).filter(
        models.User.stripe_customer_id == stripe_customer_id
    ).first()


def get_users(db: Session, skip: int = 0, limit: int = 100):
    """
    Get a paginated list of all users.
    skip: how many rows to skip (offset) — e.g., skip=20 starts at row 21
    limit: max rows to return — e.g., limit=20 returns at most 20 users
    """
    return db.query(models.User).offset(skip).limit(limit).all()


def create_user(db: Session, user: schemas.UserCreate):
    """
    Create a new user account.

    The password is hashed before storage — we never store plain-text passwords.
    is_active and email_verified are both False until the user verifies their email.
    """
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        hashed_password=hashed_password,
        role=user.role,
        is_active=False,        # inactive until email verified
        email_verified=False,   # not verified yet
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)  # reload from DB to get generated fields (id, created_at)
    return db_user


def update_user(db: Session, user_id: int, user_update: schemas.UserUpdate):
    """
    Update specific fields of a user record.
    exclude_unset=True means only fields explicitly provided in the request are updated.
    Fields not in the request body are left unchanged.
    """
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        for key, value in user_update.dict(exclude_unset=True).items():
            setattr(db_user, key, value)
        db.commit()
        db.refresh(db_user)
    return db_user


# ── Project CRUD ───────────────────────────────────────────────────────────────

def get_project(db: Session, project_id: int):
    """Get a single project by ID."""
    return db.query(models.Project).filter(models.Project.id == project_id).first()


def get_projects_by_owner(db: Session, owner_id: int, skip: int = 0, limit: int = 100):
    """
    Get projects owned by a specific user (paginated).
    owner_id has an index so this is a fast lookup.
    """
    return (
        db.query(models.Project)
        .filter(models.Project.owner_id == owner_id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_project(db: Session, project: schemas.ProjectCreate, owner_id: int):
    """
    Create a new project owned by the specified user.
    project.dict() converts the Pydantic schema to a plain dict for the model.
    """
    db_project = models.Project(**project.dict(), owner_id=owner_id)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


def update_project(db: Session, project_id: int, project_update: schemas.ProjectUpdate):
    """Update a project's fields (partial update — only provided fields change)."""
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if db_project:
        for key, value in project_update.dict(exclude_unset=True).items():
            setattr(db_project, key, value)
        db.commit()
        db.refresh(db_project)
    return db_project


def delete_project(db: Session, project_id: int):
    """Permanently delete a project from the database."""
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if db_project:
        db.delete(db_project)
        db.commit()
    return db_project


def get_project_count_by_owner(db: Session, owner_id: int) -> int:
    """Count how many projects a user owns (used to enforce the free plan limit)."""
    return db.query(models.Project).filter(models.Project.owner_id == owner_id).count()


# ── Team CRUD ──────────────────────────────────────────────────────────────────

def get_team(db: Session, team_id: int):
    """Get a team by ID."""
    return db.query(models.Team).filter(models.Team.id == team_id).first()


def get_teams_for_user(db: Session, user_id: int, skip: int = 0, limit: int = 100):
    """
    Get all teams a user is associated with — teams they own OR teams they joined.
    Uses UNION to combine both queries into a single database operation.
    """
    owned = db.query(models.Team).filter(models.Team.owner_id == user_id)
    member = (
        db.query(models.Team)
        .join(models.TeamMember)
        .filter(models.TeamMember.user_id == user_id)
    )
    return owned.union(member).offset(skip).limit(limit).all()


def create_team(db: Session, team: schemas.TeamCreate, owner_id: int):
    """Create a new team owned by the specified user."""
    db_team = models.Team(**team.dict(), owner_id=owner_id)
    db.add(db_team)
    db.commit()
    db.refresh(db_team)
    return db_team


def get_team_member(db: Session, team_id: int, user_id: int):
    """
    Get a specific TeamMember record (checks if a user is in a team).
    Returns None if the user is not a member.
    Both team_id and user_id have indexes so this lookup is fast.
    """
    return db.query(models.TeamMember).filter(
        and_(
            models.TeamMember.team_id == team_id,
            models.TeamMember.user_id == user_id
        )
    ).first()


def get_team_members(db: Session, team_id: int):
    """Get all members of a team (used for team member list and notification broadcast)."""
    return db.query(models.TeamMember).filter(models.TeamMember.team_id == team_id).all()


def get_team_member_count(db: Session, team_id: int) -> int:
    """Count members in a team (used in analytics dashboard)."""
    return db.query(models.TeamMember).filter(models.TeamMember.team_id == team_id).count()


def create_team_member(db: Session, team_id: int, user_id: int, role: str = "member"):
    """
    Add a user to a team with a specified role.
    Called when: owner creates a team (role='owner'), invitation is accepted (role='member').
    """
    membership = models.TeamMember(team_id=team_id, user_id=user_id, role=role)
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


def remove_team_member(db: Session, member_id: int):
    """Remove a team member by their TeamMember.id (not user ID)."""
    membership = db.query(models.TeamMember).filter(models.TeamMember.id == member_id).first()
    if membership:
        db.delete(membership)
        db.commit()
    return membership


def create_team_invitation(
    db: Session, team_id: int, invitee_id: int, invited_by_id: int, token: str
):
    """
    Create a team invitation record.
    token: a URL-safe random string used to identify this invitation link.
    """
    invitation = models.TeamInvitation(
        team_id=team_id,
        invitee_id=invitee_id,
        invited_by_id=invited_by_id,
        token=token
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    return invitation


def get_team_invitation(db: Session, invitation_id: int):
    """Get a team invitation by its ID."""
    return db.query(models.TeamInvitation).filter(
        models.TeamInvitation.id == invitation_id
    ).first()


def get_team_invitation_by_token(db: Session, token: str):
    """Get a team invitation by its unique token (used for email link verification)."""
    return db.query(models.TeamInvitation).filter(
        models.TeamInvitation.token == token
    ).first()


def get_pending_invitations_for_user(db: Session, user_id: int):
    """
    Get all pending invitations addressed to a specific user.
    Only returns status='pending' invitations (accepted/declined are hidden).
    """
    return db.query(models.TeamInvitation).filter(
        and_(
            models.TeamInvitation.invitee_id == user_id,
            models.TeamInvitation.status == "pending"
        )
    ).all()


def update_team_invitation_status(db: Session, invitation_id: int, status: str):
    """Update an invitation's status to 'accepted' or 'declined'."""
    invitation = get_team_invitation(db, invitation_id)
    if invitation:
        invitation.status = status
        db.commit()
        db.refresh(invitation)
    return invitation


# ── Notification CRUD ──────────────────────────────────────────────────────────

def create_notification(
    db: Session, user_id: int, title: str, message: str, type: str = "info"
):
    """
    Create an in-app notification for a user.

    type options: 'info', 'alert', 'billing', 'system'
    is_read defaults to False — the notification is unread when created.
    """
    note = models.Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def get_notifications_for_user(
    db: Session, user_id: int, skip: int = 0, limit: int = 100
):
    """
    Get notifications for a user, newest first (paginated).
    user_id is indexed so this is a fast query even with many notifications.
    """
    return (
        db.query(models.Notification)
        .filter(models.Notification.user_id == user_id)
        .order_by(models.Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def mark_notification_as_read(db: Session, notification_id: int):
    """Mark a single notification as read by setting is_read=True."""
    note = db.query(models.Notification).filter(
        models.Notification.id == notification_id
    ).first()
    if note:
        note.is_read = True
        db.commit()
        db.refresh(note)
    return note


def mark_all_notifications_as_read(db: Session, user_id: int):
    """
    Mark ALL unread notifications for a user as read in one bulk UPDATE query.
    Much faster than loading each notification and updating individually.
    """
    db.query(models.Notification).filter(
        models.Notification.user_id == user_id,
        models.Notification.is_read == False
    ).update({models.Notification.is_read: True})
    db.commit()


# ── Project Activity CRUD ──────────────────────────────────────────────────────

def create_project_activity(db: Session, project_id: int, user_id: int, action: str):
    """
    Log a project action to the audit trail.
    action: 'created', 'updated', or 'deleted'
    Called automatically by the projects router on every write operation.
    """
    activity = models.ProjectActivity(
        project_id=project_id,
        user_id=user_id,
        action=action
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


def get_project_activities_for_project(
    db: Session, project_id: int, skip: int = 0, limit: int = 100
):
    """
    Get the activity timeline for a project (newest first, paginated).
    project_id is indexed so this is a fast query.
    """
    return (
        db.query(models.ProjectActivity)
        .filter(models.ProjectActivity.project_id == project_id)
        .order_by(models.ProjectActivity.timestamp.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# ── Analytics / Dashboard CRUD ─────────────────────────────────────────────────

def get_user_dashboard(db: Session, user_id: int) -> dict:
    """
    Build the personal analytics dashboard for a user.

    Runs 4 queries:
      1. Count projects owned by this user
      2. Get their active subscription (if any)
      3. Count team members in their owned teams
      4. Get the 10 most recent project activities across their projects

    Called by GET /users/dashboard. Result is NOT cached (user-specific data
    that changes frequently — projects created/deleted, team changes).
    """
    # 1. Total projects owned
    total_projects = db.query(models.Project).filter(
        models.Project.owner_id == user_id
    ).count()

    # 2. Active subscription details
    subscription = db.query(models.Subscription).filter(
        and_(
            models.Subscription.user_id == user_id,
            models.Subscription.status == "active"
        )
    ).first()

    # 3. Team member count (people in teams the user owns)
    team_member_count = (
        db.query(models.TeamMember)
        .join(models.Team)
        .filter(models.Team.owner_id == user_id)
        .count()
    )

    # 4. Recent project activity (last 10 events across all user's projects)
    recent_activity = (
        db.query(models.ProjectActivity)
        .join(models.Project)
        .filter(models.Project.owner_id == user_id)
        .order_by(models.ProjectActivity.timestamp.desc())
        .limit(10)
        .all()
    )

    return {
        "total_projects": total_projects,
        "active_subscription": bool(subscription),
        "subscription_plan": subscription.plan if subscription else "free",
        "team_member_count": team_member_count,
        "recent_activity": recent_activity,
    }


def get_admin_dashboard(db: Session) -> dict:
    """..."""
    # Total users
    total_users = db.query(models.User).count()

    # Pro plan count — users who have an active Subscription row with plan="pro"
    pro_plan_count = db.query(models.Subscription).filter(
        models.Subscription.plan == "pro"
    ).count()

    # ── FREE PLAN FIX ──────────────────────────────────────────────────────────
    # Free plan users = Total users MINUS users who have any subscription row.
    # We cannot just count subscription rows with plan="free" because most free
    # users never get a subscription row created — they register and stay on free
    # with no record in the subscriptions table at all.
    users_with_any_subscription = db.query(models.Subscription.user_id).distinct().count()
    free_plan_count = total_users - users_with_any_subscription
    # ──────────────────────────────────────────────────────────────────────────

    # Active subscriptions
    active_subscriptions = db.query(models.Subscription).filter(
        models.Subscription.status == "active"
    ).count()

    # Monthly registrations
    monthly = db.query(
        func.DATE_FORMAT(models.User.created_at, "%Y-%m").label("month"),
        func.count(models.User.id).label("count")
    ).group_by("month").order_by("month").all()

    monthly_registrations = [
        {"month": month, "count": count}
        for month, count in monthly
    ]

    return {
        "total_users": total_users,
        "free_plan_count": free_plan_count,   # now correctly = total - subscribed
        "pro_plan_count": pro_plan_count,
        "monthly_registrations": monthly_registrations,
        "active_subscriptions": active_subscriptions,
    }

# ── Subscription CRUD ──────────────────────────────────────────────────────────

def get_subscription(db: Session, subscription_id: int):
    """Get a subscription by its primary key."""
    return db.query(models.Subscription).filter(
        models.Subscription.id == subscription_id
    ).first()


def get_subscription_by_user(db: Session, user_id: int):
    """
    Get the active subscription for a user.
    Returns None if the user has no active subscription (treated as free plan).
    user_id is indexed for fast lookup.
    """
    return db.query(models.Subscription).filter(
        and_(
            models.Subscription.user_id == user_id,
            models.Subscription.status == "active"
        )
    ).first()


def get_subscription_by_stripe_subscription_id(db: Session, stripe_subscription_id: str):
    """Get a subscription by Stripe's subscription ID (used in webhook processing)."""
    return db.query(models.Subscription).filter(
        models.Subscription.stripe_subscription_id == stripe_subscription_id
    ).first()


def get_subscriptions(db: Session, skip: int = 0, limit: int = 100):
    """Get all subscriptions (paginated) — used in the admin subscriptions panel."""
    return db.query(models.Subscription).offset(skip).limit(limit).all()


def create_subscription(db: Session, subscription: schemas.SubscriptionCreate):
    """Create a new subscription record (called after Stripe checkout completes)."""
    db_subscription = models.Subscription(**subscription.dict())
    db.add(db_subscription)
    db.commit()
    db.refresh(db_subscription)
    return db_subscription


def update_subscription(
    db: Session, subscription_id: int, subscription_update: schemas.SubscriptionUpdate
):
    """Update subscription fields (used in Stripe webhook handlers)."""
    db_subscription = db.query(models.Subscription).filter(
        models.Subscription.id == subscription_id
    ).first()
    if db_subscription:
        for key, value in subscription_update.dict(exclude_unset=True).items():
            setattr(db_subscription, key, value)
        db.commit()
        db.refresh(db_subscription)
    return db_subscription


# ── Admin Team CRUD ────────────────────────────────────────────────────────────

def get_all_teams(db: Session, skip: int = 0, limit: int = 100):
    """
    Get ALL teams on the platform (admin only, paginated).

    Unlike get_teams_for_user() which filters by membership,
    this returns every team regardless of who owns it.
    Used by the admin panel to oversee all teams on the platform.
    """
    return db.query(models.Team).offset(skip).limit(limit).all()


def get_all_team_members(db: Session, team_id: int):
    """
    Get all members of a specific team with their user details.

    Used by the admin panel to inspect who is in any team.
    Joins TeamMember with User so the admin sees emails, not just user IDs.
    """
    return (
        db.query(models.TeamMember, models.User)
        .join(models.User, models.TeamMember.user_id == models.User.id)
        .filter(models.TeamMember.team_id == team_id)
        .all()
    )


def get_team_count(db: Session) -> int:
    """
    Count the total number of teams on the platform.
    Used by the admin dashboard stats card.
    """
    return db.query(models.Team).count()


def admin_delete_team_member(db: Session, team_id: int, member_id: int):
    """
    Remove a team member by their TeamMember.id (admin override).

    Admin can remove anyone from any team without being the owner.
    Used for moderation purposes.
    """
    membership = db.query(models.TeamMember).filter(
        models.TeamMember.id == member_id,
        models.TeamMember.team_id == team_id
    ).first()
    if membership:
        db.delete(membership)
        db.commit()
    return membership
