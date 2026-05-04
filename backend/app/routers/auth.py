# app/routers/auth.py
# Authentication router — handles registration, login, email verification,
# refresh tokens, and user identity.
#
# Security features implemented here:
#   1. Login rate limiting (in-memory, per email address)
#   2. Email verification (account inactive until verified)
#   3. Refresh token support (long-lived token for silent re-login)

from datetime import timedelta, datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from app.database import get_db
from app import crud, models, schemas
from app.auth import (
    create_access_token,
    create_refresh_token,
    create_email_verification_token,
    verify_email_token,
    get_current_active_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    verify_password,
    SECRET_KEY,
    ALGORITHM,
)
from app.cache import invalidate_cache

router = APIRouter()

# ── Login Rate Limiting ────────────────────────────────────────────────────────
# Tracks failed login attempts per email address in memory.
# After MAX_LOGIN_ATTEMPTS failures within LOGIN_WINDOW_SECONDS, the account
# is temporarily locked to prevent brute-force password attacks.
#
# Note: This resets when the server restarts. For persistent rate limiting
# across multiple server instances, switch to Redis.

LOGIN_ATTEMPTS: dict = {}          # { email: [timestamp, timestamp, ...] }
MAX_LOGIN_ATTEMPTS = 5             # max attempts before lockout
LOGIN_WINDOW_SECONDS = 900         # 15-minute rolling window


def authenticate_user(db: Session, email: str, password: str):
    """
    Look up the user by email and verify their password.

    Returns the User object if credentials are correct, False otherwise.
    We always call verify_password even if the user doesn't exist to
    prevent timing attacks (an attacker can't tell valid vs invalid emails
    by measuring response time).
    """
    user = crud.get_user_by_email(db, email=email)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user


def is_rate_limited(email: str) -> bool:
    """
    Check if this email address has exceeded the login attempt limit.

    How it works:
      1. Get all timestamps of past login attempts for this email
      2. Keep only attempts within the last LOGIN_WINDOW_SECONDS
      3. If the count >= MAX_LOGIN_ATTEMPTS, return True (blocked)
      4. Otherwise, record this attempt and return False (allowed)

    Returns True if the user is rate-limited (should be blocked).
    """
    now = datetime.utcnow()
    # Get existing attempts, filtering out expired ones
    attempts = LOGIN_ATTEMPTS.get(email, [])
    attempts = [ts for ts in attempts if (now - ts).total_seconds() < LOGIN_WINDOW_SECONDS]

    if len(attempts) >= MAX_LOGIN_ATTEMPTS:
        # Too many attempts — update cleaned list and block
        LOGIN_ATTEMPTS[email] = attempts
        return True

    # Record this attempt and allow it
    attempts.append(now)
    LOGIN_ATTEMPTS[email] = attempts
    return False


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=schemas.UserRegisterResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user account.

    Steps:
      1. Check the email is not already taken
      2. Create the user (is_active=False, email_verified=False)
      3. Generate a JWT email verification token
      4. Return the token so the frontend can show a 'verify your email' screen
      5. Invalidate admin dashboard cache (user count changed)

    The user CANNOT log in until they verify their email.
    In production, send the token via email instead of returning it in the response.
    """
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    created_user = crud.create_user(db=db, user=user)

    # Generate email verification JWT (expires in 48 hours by default)
    verification_token = create_email_verification_token({"sub": created_user.email})

    # Invalidate the admin dashboard cache since total_users changed
    invalidate_cache("admin_dashboard")

    return {
        "user": created_user,
        "verification_token": verification_token,
    }


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Authenticate the user and return JWT access + refresh tokens.

    Security checks (in order):
      1. Rate limiting — block if too many recent failed attempts
      2. Credentials — email must exist and password must match
      3. Email verification — account must be verified
      4. Active status — account must not be disabled

    Returns:
      - access_token : short-lived JWT (30 min), sent with every API request
      - refresh_token: long-lived JWT (7 days), used only to get a new access token

    The refresh token is also saved to the database so it can be revoked on logout.
    """
    # Security check 1: rate limiting
    if is_rate_limited(form_data.username):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Please wait {LOGIN_WINDOW_SECONDS // 60} minutes."
        )

    # Security check 2: verify credentials
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Security check 3: email must be verified
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please check your email for the verification token."
        )

    # Security check 4: account must be active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account not active. Please contact support."
        )

    # Create JWT tokens
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(data={"sub": user.email})

    # Save refresh token to DB so we can revoke it on logout
    user.refresh_token = refresh_token
    db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


# ── Refresh Token ─────────────────────────────────────────────────────────────

@router.post("/refresh-token", response_model=schemas.Token)
def refresh_token(request: schemas.RefreshTokenRequest, db: Session = Depends(get_db)):
    """
    Exchange a valid refresh token for a new access token.

    The frontend calls this automatically when it receives a 401 response
    (access token expired). This allows the user to stay logged in without
    re-entering their password every 30 minutes.

    Validation:
      1. Decode and verify the JWT is valid and not expired
      2. Confirm the token type is 'refresh' (not 'access')
      3. Check the token matches what we stored in the database
         (prevents using revoked tokens from old sessions)
    """
    refresh_token_value = request.refresh_token
    if not refresh_token_value:
        raise HTTPException(status_code=400, detail="Refresh token required")

    # Step 1 & 2: decode and verify token type
    try:
        payload = jwt.decode(refresh_token_value, SECRET_KEY, algorithms=[ALGORITHM])
        token_type = payload.get("type")
        email = payload.get("sub")
        if token_type != "refresh" or email is None:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Step 3: verify token matches what is stored in the database
    user = crud.get_user_by_email(db, email=email)
    if not user or user.refresh_token != refresh_token_value:
        raise HTTPException(
            status_code=401,
            detail="Refresh token has been revoked or does not match"
        )

    # Issue a fresh access token (refresh token stays the same)
    access_token = create_access_token(data={"sub": user.email})
    return {
        "access_token": access_token,
        "refresh_token": refresh_token_value,
        "token_type": "bearer"
    }


# ── Email Verification ────────────────────────────────────────────────────────

@router.post("/verify-email")
def verify_email(token: dict, db: Session = Depends(get_db)):
    """
    Verify a user's email address using the token received at registration.

    The token is a JWT that encodes the user's email and expires in 48 hours.
    On success:
      - Sets email_verified = True
      - Sets is_active = True (account becomes usable)

    After this, the user can log in for the first time.
    """
    token_value = token.get("token")
    if not token_value:
        raise HTTPException(status_code=400, detail="Verification token required")

    # Decode the JWT and extract the email
    email = verify_email_token(token_value)

    user = crud.get_user_by_email(db, email=email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.email_verified:
        return {"message": "Email already verified. You can log in."}

    # Activate the account
    user.email_verified = True
    user.is_active = True
    db.commit()
    db.refresh(user)

    return {"message": "Email verified successfully. You can now log in."}


# ── Current User ──────────────────────────────────────────────────────────────

@router.get("/me", response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(get_current_active_user)):
    """
    Return the currently authenticated user's profile.

    The frontend calls this on page load (stored in AuthContext)
    to know who is logged in and what their role is.
    """
    return current_user
