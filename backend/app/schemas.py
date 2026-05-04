# app/schemas.py
# Pydantic schemas — define the shape of API requests and responses.
#
# WHY separate schemas from models?
# - Models = SQLAlchemy = talks to the database
# - Schemas = Pydantic = validates API input and controls API output
# - We never expose hashed_password, refresh_token, or internal fields in responses
# - Response schemas use "from_attributes = True" (formerly orm_mode)
#   to allow conversion from SQLAlchemy objects to Pydantic models

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


# ── User Schemas ───────────────────────────────────────────────────────────────

class UserBase(BaseModel):
    """Shared fields used by both UserCreate and User response."""
    email: EmailStr


class UserCreate(UserBase):
    """
    Request body for POST /auth/register.
    password: plain text — hashed in crud.create_user() before storage.
    role: 'user' by default; only set to 'admin' manually in the database.
    """
    password: str = Field(..., min_length=8, description="Must be at least 8 characters")
    role: str = "user"


class UserUpdate(BaseModel):
    """
    Request body for PUT /users/me (partial update).
    All fields are Optional — only provided fields are updated.
    """
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None


class User(UserBase):
    """
    Response schema for user endpoints.
    Does NOT include hashed_password or refresh_token for security.
    """
    id: int
    role: str
    is_active: bool
    email_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True  # allow SQLAlchemy model → Pydantic conversion


class UserRegisterResponse(BaseModel):
    """
    Response for POST /auth/register.
    Returns the user data AND the email verification token.
    In production, the token would be emailed instead of returned here.
    """
    user: User
    verification_token: str


# ── Token Schemas ──────────────────────────────────────────────────────────────

class Token(BaseModel):
    """
    Response schema for POST /auth/login and POST /auth/refresh-token.
    Both access_token and refresh_token are returned.
    """
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    """Request body for POST /auth/refresh-token."""
    refresh_token: str


# ── Team Schemas ───────────────────────────────────────────────────────────────

class TeamCreate(BaseModel):
    """Request body for POST /teams."""
    name: str = Field(..., min_length=1, max_length=100)


class TeamMember(BaseModel):
    """
    Response schema for a single team member.
    Returns the user's email and role, not the full User object.
    """
    id: int
    team_id: int
    user_id: int
    role: str
    invited_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Team(BaseModel):
    """Response schema for a team object."""
    id: int
    name: str
    owner_id: int
    created_at: datetime
    members: List[TeamMember] = []

    class Config:
        from_attributes = True


class TeamInvitationCreate(BaseModel):
    """Request body for POST /teams/{team_id}/invite."""
    invited_email: EmailStr


class InvitationResponse(BaseModel):
    """Request body for POST /teams/invitations/{id}/respond."""
    action: str = Field(..., pattern="^(accepted|declined)$")


class TeamInvitation(BaseModel):
    """Response schema for a team invitation."""
    id: int
    team_id: int
    invitee_id: int
    invited_by_id: int
    status: str
    token: str
    invited_at: datetime

    class Config:
        from_attributes = True


# ── Project Schemas ────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    """Request body for POST /projects."""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    team_id: Optional[int] = None  # null = personal project


class ProjectUpdate(BaseModel):
    """
    Request body for PUT /projects/{id} (partial update).
    All fields optional — only provided fields are changed.
    """
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    team_id: Optional[int] = None


class ProjectActivity(BaseModel):
    """Response schema for one project activity log entry."""
    id: int
    project_id: int
    user_id: int
    action: str          # "created", "updated", "deleted"
    timestamp: datetime

    class Config:
        from_attributes = True


class Project(BaseModel):
    """Response schema for a project (includes recent activities)."""
    id: int
    name: str
    description: Optional[str]
    owner_id: int
    team_id: Optional[int]
    created_at: datetime
    activities: List[ProjectActivity] = []

    class Config:
        from_attributes = True


# ── Subscription Schemas ───────────────────────────────────────────────────────

class SubscriptionCreate(BaseModel):
    """Internal schema used when creating a subscription after Stripe checkout."""
    user_id: int
    stripe_customer_id: str
    stripe_subscription_id: str
    plan: str = "free"
    status: str = "active"


class SubscriptionUpdate(BaseModel):
    """Internal schema used in Stripe webhook processing."""
    plan: Optional[str] = None
    status: Optional[str] = None
    current_period_end: Optional[datetime] = None


class Subscription(BaseModel):
    """Response schema for a subscription object."""
    id: int
    user_id: int
    plan: str
    status: str
    current_period_end: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Notification Schemas ───────────────────────────────────────────────────────

class Notification(BaseModel):
    """Response schema for a notification object."""
    id: int
    user_id: int
    title: str
    message: str
    type: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Dashboard / Analytics Schemas ─────────────────────────────────────────────

class MonthlyRegistration(BaseModel):
    """One data point in the monthly registrations chart."""
    month: str    # e.g., "2025-01"
    count: int


class UserDashboard(BaseModel):
    """
    Response schema for GET /users/dashboard.
    Powers the user's personal analytics panel.
    """
    total_projects: int
    active_subscription: bool
    subscription_plan: str
    team_member_count: int
    recent_activity: List[ProjectActivity] = []


class AdminDashboard(BaseModel):
    """
    Response schema for GET /admin/dashboard.
    Powers the admin analytics panel.
    """
    total_users: int
    free_plan_count: int
    pro_plan_count: int
    monthly_registrations: List[MonthlyRegistration]
    active_subscriptions: int


# ── Admin Team Schemas ─────────────────────────────────────────────────────────

class TeamMemberWithUser(BaseModel):
    """
    Extended TeamMember schema that includes the member's email address.
    Used in the admin team detail view so admins see emails, not just user IDs.
    """
    id: int
    team_id: int
    user_id: int
    user_email: str        # email pulled from the joined User record
    role: str
    invited_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TeamWithMemberCount(BaseModel):
    """
    Team summary schema for the admin teams list.
    Includes member_count so the admin list doesn't need a separate query per team.
    """
    id: int
    name: str
    owner_id: int
    owner_email: str       # pulled from the joined User (owner)
    member_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class AdminDashboardV2(AdminDashboard):
    """
    Extended admin dashboard that also includes total_teams count.
    Inherits all fields from AdminDashboard and adds total_teams.
    """
    total_teams: int


# ── Admin Notification Broadcast Schema ───────────────────────────────────────

class AdminNotificationBroadcast(BaseModel):
    """
    Request body for POST /admin/notifications/broadcast.

    title   : notification heading shown in bold
    message : full notification body text
    user_ids: optional — if provided, send only to those users.
              If empty or omitted, broadcast to ALL users on the platform.
    """
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    user_ids: Optional[List[int]] = None   # None = send to all users


# ── Task Schemas ───────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    """
    Request body for POST /projects/{id}/tasks.
    title is required. All other fields are optional on creation.
    """
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = Field(default="todo", pattern="^(todo|in_progress|done|blocked)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high)$")
    assigned_to: Optional[int] = None
    due_date: Optional[datetime] = None


class TaskUpdate(BaseModel):
    """
    Request body for PUT /tasks/{id} (partial update).
    All fields optional — only provided fields are updated.
    """
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    priority: Optional[str] = Field(None, pattern="^(low|medium|high)$")
    assigned_to: Optional[int] = None
    due_date: Optional[datetime] = None


class TaskStatusUpdate(BaseModel):
    """
    Request body for PATCH /tasks/{id}/status.
    Only the status field — transitions are validated server-side.
    """
    status: str = Field(..., pattern="^(todo|in_progress|done|blocked)$")


class TaskActivityOut(BaseModel):
    """Response schema for a single task activity log entry."""
    id: int
    task_id: int
    user_id: int
    action: str
    old_value_json: Optional[str] = None
    new_value_json: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TaskOut(BaseModel):
    """
    Full task response — returned by GET /tasks/{id} and task list endpoints.
    Includes assignee and creator info for display in the UI.
    """
    id: int
    project_id: int
    title: str
    description: Optional[str]
    status: str
    priority: str
    assigned_to: Optional[int]
    created_by: int
    due_date: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class TaskWithActivities(TaskOut):
    """TaskOut extended with the activity timeline — used in task detail view."""
    activities: List[TaskActivityOut] = []


# ── Saved Filter Schemas ───────────────────────────────────────────────────────

class SavedFilterCreate(BaseModel):
    """Request body for POST /filters — save a new filter configuration."""
    name: str = Field(..., min_length=1, max_length=255)
    filters_json: str  # JSON string: e.g. '{"status":"in_progress","priority":"high"}'


class SavedFilterOut(BaseModel):
    """Response schema for a saved filter."""
    id: int
    user_id: int
    name: str
    filters_json: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Dashboard task summary (extends UserDashboard) ────────────────────────────

class TaskDeadlineSummary(BaseModel):
    """Summary of task deadlines for the user dashboard widget."""
    overdue_count: int
    due_today_count: int
    due_this_week_count: int
