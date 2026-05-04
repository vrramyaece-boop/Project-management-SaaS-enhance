# Project Management SaaS

A full-stack SaaS platform with subscription billing, team collaboration,
task management, workflow automation, and analytics.

---

## Quick Start

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # Mac/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload
```
API runs at **http://localhost:8000** — Swagger docs at **/docs**

### Frontend
```bash
cd frontend
npm install
npm run dev
```
App runs at **http://localhost:5173**

---

## New Modules (v3.0)

### Module 1 — Task Management
Full CRUD for tasks inside projects. Each task has a title, description,
status, priority, assignee, due date, and completion timestamp.

| Endpoint | Description |
|---|---|
| `POST /projects/{id}/tasks` | Create a task |
| `GET /projects/{id}/tasks` | List tasks (with filters) |
| `GET /tasks/{id}` | Task details + activity |
| `PUT /tasks/{id}` | Update task |
| `DELETE /tasks/{id}` | Delete task |

### Module 2 — Workflow Rules
Controlled status transitions enforce real-world workflow constraints.

| From | Allowed To |
|---|---|
| `todo` | `in_progress` |
| `in_progress` | `done`, `blocked` |
| `blocked` | `in_progress` |
| `done` | locked (admin/owner can revert) |

Endpoint: `PATCH /tasks/{id}/status`

### Module 3 — Advanced Filters & Saved Views
Filter tasks by status, priority, assignee, due date, and overdue flag.
Save filter combinations as named views for quick reuse.

| Endpoint | Description |
|---|---|
| `GET /projects/{id}/tasks?status=in_progress&priority=high` | Filtered list |
| `POST /filters` | Save a filter |
| `GET /filters` | List saved filters |
| `DELETE /filters/{id}` | Delete saved filter |
| `GET /filters/{id}/apply` | Apply saved filter |

### Module 4 — Deadline & Overdue Tracking
Detect and display tasks that are overdue or due soon.

| Endpoint | Description |
|---|---|
| `GET /tasks/overdue` | Tasks past due date |
| `GET /tasks/due-today` | Tasks due today |
| `GET /tasks/due-week` | Tasks due within 7 days |
| `GET /tasks/deadline-summary` | Counts for dashboard widgets |

### Module 5 — Table + Kanban View
The TasksPage supports toggling between a sortable Table view and a
Kanban board grouped by status. Uses existing task APIs.

Endpoint: `GET /projects/{id}/tasks/grouped`

### Module 6 — Task Activity History
Every task action (create, update, status change, assignment, delete)
is logged with old and new values in JSON.

---

## Architecture

```
backend/
  app/
    models.py         — All DB tables (Task, TaskActivity, SavedFilter added)
    schemas.py        — Pydantic request/response models
    crud.py           — Database query functions
    auth.py           — JWT + bcrypt utilities
    cache.py          — In-memory caching (5-min TTL for admin dashboard)
    routers/
      auth.py         — Register, login, email verify, refresh token
      projects.py     — Project CRUD + activity logging
      tasks.py        — NEW: All 6 task modules
      teams.py        — Team collaboration + invitations
      notifications.py— In-app notification system
      admin.py        — Admin panel + team management + broadcast notifications
      users.py        — User profile + dashboard analytics
      subscriptions.py— Stripe billing integration

frontend/src/
  pages/
    TasksPage.jsx     — NEW: Table + Kanban + Filters + Saved Views
    TaskDetailPage.jsx— NEW: Task detail + Activity Timeline
    (all existing pages unchanged)
  api.js              — Task API functions appended
  App.jsx             — Task routes added
```
