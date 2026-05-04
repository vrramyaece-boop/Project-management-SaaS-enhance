# app/routers/tasks.py
# Task Management router — all 6 modules from the task specification.
#
# Module 1: Task CRUD (create, list, get, update, delete)
# Module 2: Workflow rules (validated status transitions)
# Module 3: Advanced filters & saved views
# Module 4: Deadline & overdue tracking
# Module 5: UI helpers (grouped by status for Kanban)
# Module 6: Task activity history

import json
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.database import get_db
from app import models, schemas
from app.auth import get_current_active_user

router = APIRouter()

# ── Workflow: allowed status transitions ──────────────────────────────────────
# Key = current status, Value = list of statuses it can move TO.
# Admin and project owners can override (bypass restrictions on 'done').
ALLOWED_TRANSITIONS = {
    "todo":        ["in_progress"],
    "in_progress": ["done", "blocked"],
    "blocked":     ["in_progress"],
    "done":        [],  # locked — only admin/owner can revert
}


def _log_task_activity(
    db: Session,
    task_id: int,
    user_id: int,
    action: str,
    old_value: dict = None,
    new_value: dict = None,
):
    """
    Write one row to task_activities for every important task change.

    action examples: 'created', 'updated', 'status_changed', 'assigned', 'deleted'
    old_value / new_value are dicts that get serialised to JSON strings.
    """
    activity = models.TaskActivity(
        task_id=task_id,
        user_id=user_id,
        action=action,
        old_value_json=json.dumps(old_value) if old_value is not None else None,
        new_value_json=json.dumps(new_value) if new_value is not None else None,
    )
    db.add(activity)
    # Caller is responsible for committing — keeps it atomic with the main change


def _check_project_access(db: Session, project_id: int, current_user: models.User):
    """
    Verify the current user can access the project (owner or team member).
    Raises HTTP 403 if they cannot.
    Returns the project object on success.
    """
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.owner_id == current_user.id:
        return project

    if project.team_id:
        membership = db.query(models.TeamMember).filter(
            and_(
                models.TeamMember.team_id == project.team_id,
                models.TeamMember.user_id == current_user.id,
            )
        ).first()
        if membership:
            return project

    raise HTTPException(
        status_code=403,
        detail="You do not have access to this project"
    )


def _check_task_modify_access(
    task: models.Task,
    project: models.Project,
    current_user: models.User,
    db: Session,
) -> bool:
    """
    Check if the user can MODIFY a task (not just view it).
    Returns True if:
      - user is the project owner, OR
      - user is a team member AND the task is assigned to them
    Admin users always get True (checked separately via role field).
    """
    if project.owner_id == current_user.id:
        return True
    if current_user.role == "admin":
        return True
    if task.assigned_to == current_user.id:
        return True
    return False


def _build_task_query(
    db: Session,
    project_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    assignee_id: Optional[int] = None,
    overdue_only: bool = False,
    due_today: bool = False,
    due_this_week: bool = False,
):
    """
    Build a dynamic SQLAlchemy query for tasks based on filter parameters.

    This is the core of Module 3 (Advanced Filters) — all filter params are
    optional and can be combined freely. The query is built incrementally.
    """
    q = db.query(models.Task)

    if project_id is not None:
        q = q.filter(models.Task.project_id == project_id)

    if status_filter:
        q = q.filter(models.Task.status == status_filter)

    if priority_filter:
        q = q.filter(models.Task.priority == priority_filter)

    if assignee_id is not None:
        q = q.filter(models.Task.assigned_to == assignee_id)

    now = datetime.now(timezone.utc)

    if overdue_only:
        # Overdue = due_date is in the past AND task is not done
        q = q.filter(
            and_(
                models.Task.due_date < now,
                models.Task.status != "done",
            )
        )

    if due_today:
        today_end = now.replace(hour=23, minute=59, second=59)
        q = q.filter(
            and_(
                models.Task.due_date >= now.replace(hour=0, minute=0, second=0),
                models.Task.due_date <= today_end,
                models.Task.status != "done",
            )
        )

    if due_this_week:
        week_end = now + timedelta(days=7)
        q = q.filter(
            and_(
                models.Task.due_date >= now,
                models.Task.due_date <= week_end,
                models.Task.status != "done",
            )
        )

    return q


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 1 — Task CRUD
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/projects/{project_id}/tasks", response_model=schemas.TaskOut, status_code=201, tags=["Tasks"])
def create_task(
    project_id: int,
    payload: schemas.TaskCreate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Create a new task inside a project (Module 1).

    Access: project owner or team members only.
    Auto-sets completed_at=None on creation (it's set when status→done).
    Logs a 'created' activity entry.
    """
    project = _check_project_access(db, project_id, current_user)

    # If assigned_to is provided, verify that user exists
    if payload.assigned_to:
        assignee = db.query(models.User).filter(models.User.id == payload.assigned_to).first()
        if not assignee:
            raise HTTPException(status_code=404, detail="Assigned user not found")

    task = models.Task(
        project_id=project_id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        assigned_to=payload.assigned_to,
        created_by=current_user.id,
        due_date=payload.due_date,
    )
    db.add(task)
    db.flush()  # get task.id before logging

    _log_task_activity(
        db, task.id, current_user.id,
        action="created",
        old_value={},
        new_value={"title": task.title, "status": task.status, "priority": task.priority},
    )
    db.commit()
    db.refresh(task)
    return task


@router.get("/projects/{project_id}/tasks", response_model=List[schemas.TaskOut], tags=["Tasks"])
def list_tasks(
    project_id: int,
    status: Optional[str] = Query(None, description="Filter by status: todo|in_progress|done|blocked"),
    priority: Optional[str] = Query(None, description="Filter by priority: low|medium|high"),
    assignee_id: Optional[int] = Query(None, description="Filter by assigned user ID"),
    overdue: bool = Query(False, description="Only show overdue tasks"),
    due_today: bool = Query(False, description="Only show tasks due today"),
    due_week: bool = Query(False, description="Only show tasks due this week"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=200, description="Max results per page"),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    List tasks for a project with optional filters (Modules 1, 3, 4).

    Supports combining all filter params:
      GET /projects/5/tasks?status=in_progress&priority=high&overdue=true

    Pagination: skip + limit query params.
    """
    _check_project_access(db, project_id, current_user)

    q = _build_task_query(
        db,
        project_id=project_id,
        status_filter=status,
        priority_filter=priority,
        assignee_id=assignee_id,
        overdue_only=overdue,
        due_today=due_today,
        due_this_week=due_week,
    )
    return q.order_by(models.Task.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/tasks/{task_id}", response_model=schemas.TaskWithActivities, tags=["Tasks"])
def get_task(
    task_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Get full task details including activity timeline (Modules 1, 6).

    Access: project owner or team member only.
    """
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _check_project_access(db, task.project_id, current_user)
    return task


@router.put("/tasks/{task_id}", response_model=schemas.TaskOut, tags=["Tasks"])
def update_task(
    task_id: int,
    payload: schemas.TaskUpdate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Update task fields: title, description, priority, assignee, due_date (Module 1).

    Does NOT handle status changes — use PATCH /tasks/{id}/status for that.
    Only the project owner or the assigned user can update.
    Logs an 'updated' activity with changed fields recorded as old/new values.
    """
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    project = _check_project_access(db, task.project_id, current_user)
    if not _check_task_modify_access(task, project, current_user, db):
        raise HTTPException(status_code=403, detail="You are not authorized to update this task")

    changes_old = {}
    changes_new = {}
    update_data = payload.model_dump(exclude_unset=True)

    for field, new_val in update_data.items():
        old_val = getattr(task, field)
        if old_val != new_val:
            changes_old[field] = str(old_val) if old_val is not None else None
            changes_new[field] = str(new_val) if new_val is not None else None
            setattr(task, field, new_val)

    if changes_old:
        _log_task_activity(
            db, task.id, current_user.id,
            action="updated",
            old_value=changes_old,
            new_value=changes_new,
        )

    db.commit()
    db.refresh(task)
    return task


@router.delete("/tasks/{task_id}", tags=["Tasks"])
def delete_task(
    task_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Delete a task (Module 1). Only project owner or admin can delete.

    Logs 'deleted' activity before removing the row.
    TaskActivity rows are cascade-deleted automatically (ondelete=CASCADE).
    """
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    project = _check_project_access(db, task.project_id, current_user)

    # Only owner or admin can delete
    if project.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the project owner or admin can delete tasks")

    _log_task_activity(
        db, task.id, current_user.id,
        action="deleted",
        old_value={"title": task.title, "status": task.status},
        new_value={},
    )
    db.commit()  # commit the activity log first

    db.delete(task)
    db.commit()
    return {"message": f"Task '{task.title}' deleted successfully"}


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 2 — Workflow Rules (status transitions)
# ═════════════════════════════════════════════════════════════════════════════

@router.patch("/tasks/{task_id}/status", response_model=schemas.TaskOut, tags=["Workflow"])
def update_task_status(
    task_id: int,
    payload: schemas.TaskStatusUpdate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Change a task's status with workflow validation (Module 2).

    Allowed transitions:
      todo        → in_progress
      in_progress → done | blocked
      blocked     → in_progress
      done        → (locked — only admin/owner can revert)

    Auto-sets completed_at when status becomes 'done'.
    Clears completed_at when status moves away from 'done'.
    Logs a 'status_changed' activity.
    """
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    project = _check_project_access(db, task.project_id, current_user)

    new_status = payload.status
    old_status = task.status

    # Skip if no actual change
    if old_status == new_status:
        return task

    # Workflow validation
    is_admin_or_owner = (
        current_user.role == "admin" or project.owner_id == current_user.id
    )

    # 'done' is locked for regular users
    if old_status == "done" and not is_admin_or_owner:
        raise HTTPException(
            status_code=403,
            detail="Cannot revert a completed task. Only the project owner or admin can do this."
        )

    # Check allowed transitions for regular users
    if not is_admin_or_owner:
        allowed = ALLOWED_TRANSITIONS.get(old_status, [])
        if new_status not in allowed:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid transition: '{old_status}' → '{new_status}'. "
                       f"Allowed: {allowed if allowed else 'none (task is locked)'}"
            )

    # Apply status change
    task.status = new_status

    # Auto-set completed_at when done; clear it when moving away from done
    if new_status == "done":
        task.completed_at = datetime.now(timezone.utc)
    else:
        task.completed_at = None

    _log_task_activity(
        db, task.id, current_user.id,
        action="status_changed",
        old_value={"status": old_status},
        new_value={"status": new_status},
    )
    db.commit()
    db.refresh(task)
    return task


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 3 — Advanced Filters & Saved Views
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/filters", response_model=schemas.SavedFilterOut, status_code=201, tags=["Filters"])
def save_filter(
    payload: schemas.SavedFilterCreate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Save a filter configuration for reuse (Module 3).

    filters_json is a JSON string encoding the filter params.
    Example: '{"status": "in_progress", "priority": "high"}'

    Each saved filter belongs to the user who created it (personal view).
    """
    saved = models.SavedFilter(
        user_id=current_user.id,
        name=payload.name,
        filters_json=payload.filters_json,
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return saved


@router.get("/filters", response_model=List[schemas.SavedFilterOut], tags=["Filters"])
def list_saved_filters(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """List all saved filters belonging to the current user (Module 3)."""
    return db.query(models.SavedFilter).filter(
        models.SavedFilter.user_id == current_user.id
    ).order_by(models.SavedFilter.created_at.desc()).all()


@router.delete("/filters/{filter_id}", tags=["Filters"])
def delete_saved_filter(
    filter_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete a saved filter (Module 3). Users can only delete their own filters."""
    saved = db.query(models.SavedFilter).filter(
        and_(
            models.SavedFilter.id == filter_id,
            models.SavedFilter.user_id == current_user.id,
        )
    ).first()
    if not saved:
        raise HTTPException(status_code=404, detail="Saved filter not found")
    db.delete(saved)
    db.commit()
    return {"message": "Filter deleted"}


@router.get("/filters/{filter_id}/apply", response_model=List[schemas.TaskOut], tags=["Filters"])
def apply_saved_filter(
    filter_id: int,
    project_id: Optional[int] = Query(None, description="Scope to a specific project"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Load and apply a saved filter to get matching tasks (Module 3).

    Retrieves the saved filters_json, parses it, and builds the same
    dynamic query as the list endpoint. Optionally scoped to a project.
    """
    saved = db.query(models.SavedFilter).filter(
        and_(
            models.SavedFilter.id == filter_id,
            models.SavedFilter.user_id == current_user.id,
        )
    ).first()
    if not saved:
        raise HTTPException(status_code=404, detail="Saved filter not found")

    try:
        filters = json.loads(saved.filters_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Saved filter contains invalid JSON")

    q = _build_task_query(
        db,
        project_id=project_id or filters.get("project_id"),
        status_filter=filters.get("status"),
        priority_filter=filters.get("priority"),
        assignee_id=filters.get("assignee_id"),
        overdue_only=filters.get("overdue", False),
        due_today=filters.get("due_today", False),
        due_this_week=filters.get("due_this_week", False),
    )
    return q.offset(skip).limit(limit).all()


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 4 — Deadline & Overdue Tracking
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/tasks/overdue", response_model=List[schemas.TaskOut], tags=["Deadlines"])
def get_overdue_tasks(
    project_id: Optional[int] = Query(None, description="Filter by project"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Get all tasks that are past their due_date and not yet done (Module 4).

    Overdue = due_date < now AND status != 'done'
    Results are sorted by due_date ascending (most overdue first).
    """
    q = _build_task_query(db, project_id=project_id, overdue_only=True)
    return q.order_by(models.Task.due_date.asc()).offset(skip).limit(limit).all()


@router.get("/tasks/due-today", response_model=List[schemas.TaskOut], tags=["Deadlines"])
def get_tasks_due_today(
    project_id: Optional[int] = Query(None),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Get all incomplete tasks due today (Module 4).
    'Today' is calculated using UTC time.
    """
    q = _build_task_query(db, project_id=project_id, due_today=True)
    return q.order_by(models.Task.due_date.asc()).all()


@router.get("/tasks/due-week", response_model=List[schemas.TaskOut], tags=["Deadlines"])
def get_tasks_due_this_week(
    project_id: Optional[int] = Query(None),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Get all incomplete tasks due within the next 7 days (Module 4).
    Does NOT include overdue tasks — only future deadlines.
    """
    q = _build_task_query(db, project_id=project_id, due_this_week=True)
    return q.order_by(models.Task.due_date.asc()).all()


@router.get("/tasks/deadline-summary", response_model=schemas.TaskDeadlineSummary, tags=["Deadlines"])
def get_deadline_summary(
    project_id: Optional[int] = Query(None, description="Scope to a specific project"),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Get counts of overdue, due-today, and due-this-week tasks (Module 4).
    Powers the dashboard deadline widgets.
    """
    overdue = _build_task_query(db, project_id=project_id, overdue_only=True).count()
    today = _build_task_query(db, project_id=project_id, due_today=True).count()
    week = _build_task_query(db, project_id=project_id, due_this_week=True).count()

    return schemas.TaskDeadlineSummary(
        overdue_count=overdue,
        due_today_count=today,
        due_this_week_count=week,
    )


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 5 — Kanban grouped view
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/projects/{project_id}/tasks/grouped", tags=["Kanban"])
def get_tasks_grouped_by_status(
    project_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Return tasks grouped by status for the Kanban board view (Module 5).

    Response format:
    {
      "todo":        [...tasks],
      "in_progress": [...tasks],
      "blocked":     [...tasks],
      "done":        [...tasks]
    }

    Each group is sorted by priority (high first) then created_at.
    """
    _check_project_access(db, project_id, current_user)

    all_tasks = (
        db.query(models.Task)
        .filter(models.Task.project_id == project_id)
        .order_by(
            # High priority first (h < i < l alphabetically so we reverse)
            models.Task.priority.desc(),
            models.Task.created_at.asc(),
        )
        .all()
    )

    grouped = {"todo": [], "in_progress": [], "blocked": [], "done": []}
    for task in all_tasks:
        key = task.status if task.status in grouped else "todo"
        grouped[key].append(schemas.TaskOut.model_validate(task))

    return grouped


# ═════════════════════════════════════════════════════════════════════════════
# MODULE 6 — Task Activity History
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/tasks/{task_id}/activities", response_model=List[schemas.TaskActivityOut], tags=["Task Activity"])
def get_task_activities(
    task_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Get the full activity timeline for a task (Module 6).

    Returns all logged actions in reverse chronological order (newest first).
    Each entry shows: action type, who did it, when, and old/new values.

    Access: project owner or team member only.
    """
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    _check_project_access(db, task.project_id, current_user)

    return (
        db.query(models.TaskActivity)
        .filter(models.TaskActivity.task_id == task_id)
        .order_by(models.TaskActivity.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
