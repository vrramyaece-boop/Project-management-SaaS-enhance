# app/routers/projects.py
# Projects router — CRUD operations with activity logging and team notifications.
#
# Every create/update/delete operation:
#   1. Performs the database change
#   2. Logs a ProjectActivity record (permanent audit trail)
#   3. Notifies other team members via in-app notifications

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.database import get_db
from app import crud, models, schemas
from app.auth import get_current_active_user

router = APIRouter()


def check_project_limit(current_user: models.User, db: Session):
    """
    Enforce the free plan project limit.

    Free plan users can only create 3 projects.
    Pro plan users have no limit.
    If the user has no subscription record, treat them as free plan.
    """
    subscription = crud.get_subscription_by_user(db, current_user.id)
    plan = subscription.plan if subscription else "free"
    project_count = crud.get_project_count_by_owner(db, current_user.id)
    if plan == "free" and project_count >= 3:
        raise HTTPException(
            status_code=403,
            detail="Free plan is limited to 3 projects. Upgrade to Pro for unlimited projects."
        )


def ensure_team_access(db: Session, team_id: int, current_user: models.User):
    """
    Verify the current user is a member of the specified team.
    Raises HTTP 403 if they are not.
    Called when creating or updating a project linked to a team.
    """
    if team_id is None:
        return  # personal project — no team check needed
    membership = crud.get_team_member(db, team_id=team_id, user_id=current_user.id)
    if not membership:
        raise HTTPException(
            status_code=403,
            detail="You must be a member of this team to manage its projects."
        )


def can_access_project(db: Session, current_user: models.User, project: models.Project) -> bool:
    """
    Check if the current user can read/edit a project.

    Access is granted if:
      - The user owns the project (owner_id match), OR
      - The project belongs to a team AND the user is a member of that team
    """
    if project.owner_id == current_user.id:
        return True
    if project.team_id and crud.get_team_member(db, project.team_id, current_user.id):
        return True
    return False


def notify_team_members(db: Session, project: models.Project, title: str, message: str):
    """
    Send an in-app notification to all team members when a team project changes.

    Skips the project owner (they triggered the action, no need to notify them).
    Only runs if the project belongs to a team (team_id is set).
    """
    if not project.team_id:
        return  # personal project — no team to notify

    members = crud.get_team_members(db, project.team_id)
    for member in members:
        if member.user_id == project.owner_id:
            continue  # skip the person who made the change
        crud.create_notification(
            db,
            user_id=member.user_id,
            title=title,
            message=message,
            type="system"
        )


# ── List Projects (paginated) ─────────────────────────────────────────────────

@router.get("/", response_model=list[schemas.Project])
def read_projects(
    skip: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=20, ge=1, le=100, description="Max records per page"),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get all projects visible to the current user (paginated).

    Visibility:
      - Projects the user owns, AND
      - Projects belonging to any team the user is a member of

    Pagination: use skip and limit query parameters.
    Example: GET /projects?skip=20&limit=20 returns page 2 of results.
    """
    # Get all team IDs the user belongs to
    team_ids = [
        member.team_id
        for member in db.query(models.TeamMember)
        .filter(models.TeamMember.user_id == current_user.id)
        .all()
    ]

    # Query: owned projects OR projects in any of the user's teams
    projects = db.query(models.Project).filter(
        or_(
            models.Project.owner_id == current_user.id,
            models.Project.team_id.in_(team_ids if team_ids else [-1])
        )
    ).offset(skip).limit(limit).all()

    return projects


# ── Create Project ────────────────────────────────────────────────────────────

@router.post("/", response_model=schemas.Project)
def create_project(
    project: schemas.ProjectCreate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Create a new project for the current user.

    Steps:
      1. Check the user has not hit the free plan limit
      2. If a team_id is provided, verify the user is a member
      3. Create the project in the database
      4. Log a 'created' activity record
      5. Notify other team members (if project belongs to a team)
    """
    check_project_limit(current_user, db)
    ensure_team_access(db, project.team_id, current_user)

    created = crud.create_project(db=db, project=project, owner_id=current_user.id)

    # Log activity (audit trail)
    crud.create_project_activity(
        db, project_id=created.id, user_id=current_user.id, action="created"
    )

    # Notify team members about the new project
    notify_team_members(
        db, project=created,
        title="New team project created",
        message=f"Project '{created.name}' was created by {current_user.email}"
    )

    return created


# ── Get Single Project ────────────────────────────────────────────────────────

@router.get("/{project_id}", response_model=schemas.Project)
def read_project(
    project_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get a specific project by its ID.

    Returns 404 if the project doesn't exist.
    Returns 403 if the user doesn't have access (not owner, not team member).
    """
    project = crud.get_project(db, project_id=project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_access_project(db, current_user, project):
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    return project


# ── Update Project ────────────────────────────────────────────────────────────

@router.put("/{project_id}", response_model=schemas.Project)
def update_project(
    project_id: int,
    project_update: schemas.ProjectUpdate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Update a project's name, description, or team assignment.

    Access: owner OR team member can update.
    After updating:
      - Logs an 'updated' activity record
      - Notifies other team members about the change
    """
    project = crud.get_project(db, project_id=project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_access_project(db, current_user, project):
        raise HTTPException(status_code=403, detail="Not authorized to update this project")

    ensure_team_access(db, project.team_id, current_user)

    updated_project = crud.update_project(db, project_id=project_id, project_update=project_update)

    # Log activity
    crud.create_project_activity(
        db, project_id=updated_project.id, user_id=current_user.id, action="updated"
    )

    # Notify team members
    notify_team_members(
        db, project=updated_project,
        title="Team project updated",
        message=f"Project '{updated_project.name}' was updated by {current_user.email}"
    )

    return updated_project


# ── Delete Project ────────────────────────────────────────────────────────────

@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Delete a project.

    Access: owner OR team member can delete.
    The activity is logged BEFORE deletion so the record still exists
    when create_project_activity tries to reference it via the FK.
    Team members are notified after deletion.
    """
    project = crud.get_project(db, project_id=project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check access
    if project.owner_id != current_user.id and not (
        project.team_id and crud.get_team_member(db, project.team_id, current_user.id)
    ):
        raise HTTPException(status_code=403, detail="Not authorized to delete this project")

    project_name = project.name  # save before deletion

    # Notify team members BEFORE deleting (while the project object still has team_id)
    notify_team_members(
        db, project=project,
        title="Team project deleted",
        message=f"Project '{project.name}' was deleted by {current_user.email}"
    )

    # Log activity BEFORE deleting (project row must still exist for the FK to resolve)
    crud.create_project_activity(
        db, project_id=project_id, user_id=current_user.id, action="deleted"
    )

    # Delete the project AFTER logging the activity
    crud.delete_project(db, project_id=project_id)

    return {"message": f"Project '{project_name}' deleted successfully"}


# ── Project Activity Timeline ─────────────────────────────────────────────────

@router.get("/{project_id}/activity", response_model=list[schemas.ProjectActivity])
def read_project_activity(
    project_id: int,
    skip: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=50, ge=1, le=200, description="Max records per page"),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get the activity timeline for a specific project (paginated).

    Returns all 'created', 'updated', 'deleted' events in reverse chronological order.
    The ProjectDetailsPage uses this to display the activity timeline.

    Access: same rules as reading the project (owner or team member).
    """
    project = crud.get_project(db, project_id=project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_access_project(db, current_user, project):
        raise HTTPException(
            status_code=403, detail="Not authorized to view this project's activity"
        )
    return crud.get_project_activities_for_project(db, project_id=project_id, skip=skip, limit=limit)
