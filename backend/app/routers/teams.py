# app/routers/teams.py
# Team collaboration router.
#
# Features:
#   - Create teams (creator auto-becomes owner + first member)
#   - Invite users by email (sends an in-app notification)
#   - Accept or decline invitations
#   - List team members
#   - Remove members (owner only)

import secrets
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app import crud, models, schemas
from app.auth import get_current_active_user

router = APIRouter()


@router.get("/", response_model=list[schemas.Team])
def read_teams(
    skip: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=100, ge=1, le=100, description="Max teams per page"),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Return all teams the current user owns or belongs to (paginated).

    Combines:
      - Teams the user created (owner)
      - Teams the user joined via an accepted invitation (member)
    """
    return crud.get_teams_for_user(db, current_user.id, skip=skip, limit=limit)


@router.post("/", response_model=schemas.Team)
def create_team(
    team: schemas.TeamCreate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Create a new collaboration team.

    The creator automatically becomes:
      - The team owner (owner_id field)
      - The first TeamMember with role='owner'

    We add them as a TeamMember too so membership queries
    (e.g., 'get all members of team X') always include the owner.
    """
    # Create the team record
    created_team = crud.create_team(db=db, team=team, owner_id=current_user.id)

    # Auto-add the creator as an owner member
    crud.create_team_member(db, team_id=created_team.id, user_id=current_user.id, role="owner")

    return created_team


@router.post("/{team_id}/invite", response_model=schemas.TeamInvitation)
def invite_team_member(
    team_id: int,
    invitation: schemas.TeamInvitationCreate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Invite a registered user to join the team by their email address.

    Only the team owner can send invitations.

    Steps:
      1. Verify the team exists
      2. Verify the current user is the owner
      3. Find the invited user by email (must already be registered)
      4. Create a TeamInvitation record with a secure random token
      5. Send an in-app notification to the invited user

    The invited user can then accept or decline via /teams/invitations/{id}/respond.
    """
    # Step 1: verify team exists
    team = crud.get_team(db, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Step 2: only the owner can invite
    if team.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the team owner can invite new members"
        )

    # Step 3: find the invited user
    invited_user = crud.get_user_by_email(db, invitation.invited_email)
    if not invited_user:
        raise HTTPException(
            status_code=404,
            detail="User not found. They must register before they can be invited."
        )

    # Prevent duplicate invitations
    existing_member = crud.get_team_member(db, team_id=team_id, user_id=invited_user.id)
    if existing_member:
        raise HTTPException(
            status_code=400,
            detail="This user is already a member of the team"
        )

    # Step 4: create invitation with a secure 24-character random token
    token = secrets.token_urlsafe(24)
    invite = crud.create_team_invitation(
        db,
        team_id=team_id,
        invitee_id=invited_user.id,
        invited_by_id=current_user.id,
        token=token
    )

    # Step 5: notify the invited user with an in-app notification
    crud.create_notification(
        db,
        user_id=invited_user.id,
        title="Team invitation received",
        message=f"You have been invited to join the team '{team.name}' by {current_user.email}",
        type="info"
    )

    return invite


@router.get("/invitations", response_model=list[schemas.TeamInvitation])
def read_my_invitations(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Return all pending team invitations addressed to the current user.

    The frontend displays these on the Teams page so the user can accept or decline.
    Only 'pending' invitations are returned (accepted/declined ones are hidden).
    """
    return crud.get_pending_invitations_for_user(db, current_user.id)


@router.post("/invitations/{invitation_id}/respond")
def respond_to_invitation(
    invitation_id: int,
    response: schemas.InvitationResponse,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Accept or decline a team invitation.

    The action must be 'accepted' or 'declined'.

    On accept:
      - Creates a TeamMember record (user joins the team)
      - Notifies the person who sent the invitation

    On decline:
      - Just updates the invitation status to 'declined'

    Security: verifies that the invitation belongs to the current user's email.
    """
    invitation = crud.get_team_invitation(db, invitation_id)

    # Verify invitation exists and belongs to this user
    if not invitation or invitation.invited_email != current_user.email:
        raise HTTPException(status_code=404, detail="Invitation not found")

    # Prevent responding twice
    if invitation.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"This invitation has already been {invitation.status}"
        )

    # Validate action
    action = response.action
    if action not in ["accepted", "declined"]:
        raise HTTPException(
            status_code=400,
            detail="Action must be 'accepted' or 'declined'"
        )

    # Update invitation status
    invitation = crud.update_team_invitation_status(db, invitation_id, action)

    if action == "accepted":
        # Add the user as a team member
        crud.create_team_member(db, team_id=invitation.team_id, user_id=current_user.id)

        # Notify the person who sent the invitation
        crud.create_notification(
            db,
            user_id=invitation.invited_by_id,
            title="Team invitation accepted",
            message=f"{current_user.email} accepted your invitation and joined the team.",
            type="info"
        )

    return {"status": invitation.status, "message": f"Invitation {action}"}


@router.get("/{team_id}/members", response_model=list[schemas.TeamMember])
def read_team_members(
    team_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    List all members of a specific team.

    Access: only the team owner or existing members can view the member list.
    """
    team = crud.get_team(db, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Only owner or existing members can see the member list
    is_owner = team.owner_id == current_user.id
    is_member = crud.get_team_member(db, team_id, current_user.id)
    if not is_owner and not is_member:
        raise HTTPException(
            status_code=403,
            detail="You must be a team member to view the member list"
        )

    return crud.get_team_members(db, team_id)


@router.delete("/{team_id}/members/{member_id}")
def remove_team_member(
    team_id: int,
    member_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Remove a member from the team (owner only).

    The team owner can remove any member except themselves.
    member_id here is the TeamMember.id (not the user's id).
    """
    team = crud.get_team(db, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if team.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the team owner can remove members"
        )

    membership = crud.remove_team_member(db, member_id)
    if not membership:
        raise HTTPException(status_code=404, detail="Team member not found")

    return {"message": "Team member removed successfully"}
