# app/auth.py
# Authentication utilities: password hashing, JWT creation and verification.
#
# This file is imported by routers/auth.py (for login/register)
# and by all other routers (via get_current_active_user dependency).

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
import os

# ── Password hashing ──────────────────────────────────────────────────────────
# CryptContext uses bcrypt — a slow hashing algorithm by design.
# bcrypt is slow to make brute-force attacks take much longer.
# Never store plain-text passwords.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── JWT configuration ─────────────────────────────────────────────────────────
# Read from environment variables — NEVER hardcode these in production.
SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret-key-change-in-production")
ALGORITHM = "HS256"                         # HMAC-SHA256 signing algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = 30            # access token lives 30 minutes
REFRESH_TOKEN_EXPIRE_DAYS = 7              # refresh token lives 7 days
EMAIL_VERIFICATION_EXPIRE_HOURS = 48       # verification link lives 48 hours

# OAuth2PasswordBearer: FastAPI reads the JWT from the Authorization header.
# tokenUrl tells Swagger UI which endpoint to call for login.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ── Password helpers ──────────────────────────────────────────────────────────

def get_password_hash(password: str) -> str:
    """
    Hash a plain-text password using bcrypt.
    Called once at registration — the hash is stored in the database.
    Example: get_password_hash("mysecret") → "$2b$12$..."
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Check if a plain-text password matches a stored bcrypt hash.
    Called during login to verify the user's entered password.
    Returns True if they match, False otherwise.
    """
    return pwd_context.verify(plain_password, hashed_password)


# ── JWT token creators ────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a short-lived JWT access token.

    The token payload (data) typically contains {"sub": user.email}.
    We add "exp" (expiry time) and "type": "access" to identify it.

    expires_delta: override the default 30-minute expiry if needed.
    The returned string is what the frontend sends in the Authorization header.
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """
    Create a long-lived JWT refresh token (7 days).

    The refresh token is used ONLY to get a new access token when it expires.
    We mark it with "type": "refresh" so the /auth/refresh-token endpoint
    can verify it's the right kind of token (not an access token being misused).
    The token is also stored in the database so it can be revoked on logout.
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_email_verification_token(data: dict) -> str:
    """
    Create a JWT used for email verification links (48-hour expiry).

    The token encodes the user's email and expires in 48 hours.
    When the user clicks the verification link, the frontend sends this
    token to /auth/verify-email, which decodes it to get the email.
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=EMAIL_VERIFICATION_EXPIRE_HOURS)
    to_encode.update({"exp": expire, "type": "email_verification"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_email_token(token: str) -> Optional[str]:
    """
    Decode and validate an email verification token.

    Returns the email address (str) if the token is valid.
    Raises HTTP 400 if the token is expired, tampered with, or wrong type.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        token_type: str = payload.get("type")
        if email is None or token_type != "email_verification":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification token"
            )
        return email
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token"
        )


# ── FastAPI dependencies ──────────────────────────────────────────────────────
# These functions are used with Depends() in route handlers.
# FastAPI calls them automatically for every protected route.

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Decode the JWT from the Authorization header and return the User object.

    Called automatically on every protected route via Depends().
    Raises HTTP 401 if the token is missing, expired, or invalid.

    Usage in a route:
        def my_route(current_user = Depends(get_current_user)):
            ...
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        token_type: str = payload.get("type")
        if email is None or token_type != "access":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Import here to avoid circular imports (auth.py → models.py is fine,
    # but models.py → auth.py would create a cycle)
    from app import crud
    user = crud.get_user_by_email(db, email=email)
    if user is None:
        raise credentials_exception
    return user


def get_current_active_user(current_user=Depends(get_current_user)):
    """
    Extends get_current_user by also checking that the account is active.

    Raises HTTP 403 if the account has been deactivated (is_active=False).
    Used on all regular user endpoints.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not active. Please verify your email first."
        )
    return current_user


def get_current_admin_user(current_user=Depends(get_current_active_user)):
    """
    Extends get_current_active_user by also checking the admin role.

    Raises HTTP 403 if the user is not an admin.
    Used on all admin-only endpoints (admin.py router).
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user
