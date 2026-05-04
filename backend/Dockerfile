# backend/Dockerfile
# Multi-stage build for the FastAPI backend.
#
# Stage 1 (builder): installs Python dependencies
# Stage 2 (runtime): copies only what's needed — smaller final image

FROM python:3.11-slim AS builder

# Set working directory
WORKDIR /app

# Install build dependencies needed for some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (Docker caches this layer — only re-runs if requirements.txt changes)
COPY requirements.txt .

# Install Python dependencies into a separate location for easy copying
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Runtime stage ──────────────────────────────────────────────────────────────

FROM python:3.11-slim

WORKDIR /app

# Install runtime system dependencies only (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmysqlclient-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder stage
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application source code
COPY . .

# Create non-root user for security (never run production containers as root)
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose the port uvicorn listens on
EXPOSE 8000

# Health check — Docker uses this to know if the container is healthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start the FastAPI server
# --host 0.0.0.0 makes it accessible from outside the container
# --workers 2 runs 2 worker processes (adjust based on CPU cores)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
