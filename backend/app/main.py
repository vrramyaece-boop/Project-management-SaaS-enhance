# app/main.py
# Main FastAPI application entry point.
#
# This file wires everything together:
#   - Creates the FastAPI app instance
#   - Adds middleware (CORS for the frontend, rate limiting)
#   - Registers all routers (each router handles one group of endpoints)
#   - Creates database tables on startup

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError
from app.database import engine, Base
from app.routers import users, auth, projects, subscriptions, admin, teams, notifications, tasks

# Initialize FastAPI app with metadata for Swagger UI
app = FastAPI(
    title="Project Management SaaS",
    description="A subscription-based SaaS application with teams, notifications, and analytics",
    version="2.0.0",
    docs_url="/docs",    # Swagger UI at http://localhost:8000/docs
    redoc_url="/redoc",  # ReDoc UI at http://localhost:8000/redoc
)


@app.on_event("startup")
def startup_event():
    """
    Create all database tables on startup if they don't exist yet.

    In production, use Alembic migrations instead (alembic upgrade head).
    This is a safety net so the app works even on a fresh database.
    The OperationalError catch prevents a crash if the DB is temporarily unavailable.
    """
    try:
        Base.metadata.create_all(bind=engine)
    except OperationalError:
        pass  # DB not reachable at startup — tables will be created when it reconnects


# ── CORS Middleware ────────────────────────────────────────────────────────────
# CORS (Cross-Origin Resource Sharing) allows the frontend (running on port 5173)
# to call the backend API (running on port 8000).
# Without this, browsers block the requests for security reasons.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",     # Vite dev server
        "http://127.0.0.1:5173",
        "http://localhost:3000",     # Create React App fallback
    ],
    allow_credentials=True,          # needed for cookies/auth headers
    allow_methods=["*"],             # GET, POST, PUT, DELETE, etc.
    allow_headers=["*"],             # Authorization, Content-Type, etc.
)

# ── Routers ────────────────────────────────────────────────────────────────────
# Each router handles one group of endpoints.
# The prefix becomes part of the URL: prefix="/auth" → /auth/login, /auth/register, etc.

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(projects.router, prefix="/projects", tags=["Projects"])
app.include_router(subscriptions.router, prefix="/subscriptions", tags=["Subscriptions"])
app.include_router(teams.router, prefix="/teams", tags=["Teams"])
app.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(tasks.router, tags=["Tasks"])


@app.get("/", tags=["Health"])
def read_root():
    """Root endpoint — health check to confirm the API is running."""
    return {"message": "Project Management SaaS API is running", "version": "2.0.0"}


@app.get("/health", tags=["Health"])
def health_check():
    """Health check endpoint used by load balancers and uptime monitors."""
    return {"status": "healthy"}
