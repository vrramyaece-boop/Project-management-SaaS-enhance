# app/models.py
# SQLAlchemy models for the database.
# Each class = one table in MySQL.
# "index=True" on a column speeds up queries that filter/search by that column.

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


# ── User ──────────────────────────────────────────────────────────────────────

class User(Base):
    """
    User model representing every registered account.

    Fields:
      - email          : unique login identifier, indexed for fast lookups
      - hashed_password: bcrypt hash (never store plain-text passwords)
      - role           : 'user' (default) or 'admin'
      - is_active      : False until the email is verified
      - email_verified : becomes True after the user clicks the verify link
      - refresh_token  : stores the current valid refresh token for this user
      - stripe_customer_id: links to Stripe for billing
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="user", nullable=False)
    is_active = Column(Boolean, default=False, nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)
    refresh_token = Column(String(512), nullable=True)
    stripe_customer_id = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    projects = relationship("Project", back_populates="owner")
    subscriptions = relationship("Subscription", back_populates="user")
    teams_owned = relationship("Team", back_populates="owner")
    team_memberships = relationship("TeamMember", back_populates="user")
    notifications = relationship("Notification", back_populates="user")
    project_activities = relationship("ProjectActivity", back_populates="user")


# ── Team ──────────────────────────────────────────────────────────────────────

class Team(Base):
    """
    Team model for collaboration between users.
    A team is owned by one user (owner_id) and can have many members.
    Only the owner can invite or remove members.
    """
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="teams_owned")
    members = relationship("TeamMember", back_populates="team")
    invitations = relationship("TeamInvitation", back_populates="team")
    projects = relationship("Project", back_populates="team")


# ── TeamMember ────────────────────────────────────────────────────────────────

class TeamMember(Base):
    """
    TeamMember — the join table between User and Team.
    role: 'owner' (the creator) or 'member' (invited collaborator).
    Both team_id and user_id are indexed for fast membership lookups.
    """
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(50), default="member", nullable=False)
    invited_at = Column("joined_at", DateTime(timezone=True), server_default=func.now(), nullable=True)

    team = relationship("Team", back_populates="members")
    user = relationship("User", back_populates="team_memberships")


# ── TeamInvitation ────────────────────────────────────────────────────────────

class TeamInvitation(Base):
    """
    TeamInvitation — tracks pending/accepted/declined team invitations.
    token: random secret sent to invitee; used to accept/decline.
    status: 'pending' -> 'accepted' or 'declined'
    """
    __tablename__ = "team_invitations"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False, index=True)
    invitee_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    invited_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(50), default="pending", nullable=False)
    token = Column(String(255), nullable=False, unique=True)
    invited_at = Column(DateTime(timezone=True), server_default=func.now())

    team = relationship("Team", back_populates="invitations")
    invitee = relationship("User", foreign_keys=[invitee_id])
    invited_by = relationship("User", foreign_keys=[invited_by_id])

    @property
    def invited_email(self):
        """Convenience property: returns the invitee's email address."""
        return self.invitee.email if self.invitee else None


# ── Project ───────────────────────────────────────────────────────────────────

class Project(Base):
    """
    Project — the core resource users create and collaborate on.
    owner_id: the user who created it (indexed for fast personal project queries).
    team_id : optional; if set, all team members can also access this project.
    """
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="projects")
    team = relationship("Team", back_populates="projects")
    activities = relationship("ProjectActivity", back_populates="project")
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")


# ── Subscription ──────────────────────────────────────────────────────────────

class Subscription(Base):
    """
    Subscription — tracks each user's billing plan via Stripe.
    plan  : 'free' or 'pro'
    status: 'active', 'canceled', or 'past_due'
    Indexed on user_id for fast per-user lookups.
    """
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    stripe_customer_id = Column(String(255), nullable=False)
    stripe_subscription_id = Column(String(255), nullable=False)
    plan = Column(String(50), default="free", nullable=False)
    status = Column(String(50), default="active", nullable=False)
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="subscriptions")


# ── Notification ──────────────────────────────────────────────────────────────

class Notification(Base):
    """
    Notification — in-app notifications for important platform events.
    type    : 'info' | 'alert' | 'billing' | 'system'
    is_read : False by default; navbar badge shows unread count.
    user_id is indexed because we always filter notifications by user.

    Triggers: team invitation, invitation accepted, project events, admin announcements.
    """
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), default="info", nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="notifications")


# ── ProjectActivity ───────────────────────────────────────────────────────────

class ProjectActivity(Base):
    """
    ProjectActivity — audit log of every action on a project.
    action: 'created' | 'updated' | 'deleted'
    Indexed on project_id (timeline queries) and user_id (user history).
    Rows are never deleted — this is the permanent audit trail.
    """
    __tablename__ = "project_activities"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(50), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    project = relationship("Project", back_populates="activities")
    user = relationship("User", back_populates="project_activities")


# ── Task ──────────────────────────────────────────────────────────────────────

class Task(Base):
    """
    Task model — a structured work item inside a project.

    Fields:
      - project_id  : which project this task belongs to (FK, indexed)
      - title       : short task name
      - description : full task details (optional)
      - status      : workflow state — 'todo' | 'in_progress' | 'done' | 'blocked'
      - priority    : 'low' | 'medium' | 'high'
      - assigned_to : user this task is assigned to (nullable FK, indexed)
      - created_by  : user who created the task (FK)
      - due_date    : optional deadline datetime
      - completed_at: auto-set when status changes to 'done', cleared otherwise
      - created_at  : auto-set on creation
      - updated_at  : auto-updated on every change

    Workflow transitions (enforced in routers/tasks.py):
      todo → in_progress
      in_progress → done | blocked
      blocked → in_progress
      done → (locked, admin/owner can revert)
    """
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="todo", nullable=False, index=True)
    priority = Column(String(50), default="medium", nullable=False, index=True)
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=True, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    project = relationship("Project", back_populates="tasks")
    assignee = relationship("User", foreign_keys=[assigned_to])
    creator = relationship("User", foreign_keys=[created_by])
    activities = relationship("TaskActivity", back_populates="task", cascade="all, delete-orphan")


# ── TaskActivity ──────────────────────────────────────────────────────────────

class TaskActivity(Base):
    """
    TaskActivity — audit log for every change made to a task.

    Logs: creation, updates, status changes, reassignments, deletion.
    old_value_json / new_value_json store the before/after values as JSON strings
    so the activity timeline can show exactly what changed.

    Examples:
      action='status_changed', old_value_json='{"status":"todo"}', new_value_json='{"status":"in_progress"}'
      action='assigned',       old_value_json='{"assigned_to":null}', new_value_json='{"assigned_to":3}'
      action='created',        old_value_json='{}', new_value_json='{"title":"Fix login bug"}'
    """
    __tablename__ = "task_activities"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(100), nullable=False)
    old_value_json = Column(Text, nullable=True)
    new_value_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    task = relationship("Task", back_populates="activities")
    user = relationship("User")


# ── SavedFilter ───────────────────────────────────────────────────────────────

class SavedFilter(Base):
    """
    SavedFilter — stores a named set of task filter criteria for reuse.

    filters_json stores the filter configuration as a JSON string.
    Example: '{"status": "in_progress", "priority": "high", "assignee_id": 3}'

    Filters are personal (user_id FK) — each user sees only their own saved views.
    """
    __tablename__ = "saved_filters"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    filters_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    user = relationship("User")
