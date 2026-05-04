// frontend/src/api.js
// Centralised API client for all backend calls.
//
// Uses axios with a base URL set from the VITE_API_URL environment variable.
// The interceptor handles automatic token refresh when a 401 response is received.

import axios from 'axios'

// Base URL: reads from .env file (VITE_API_URL=http://127.0.0.1:8000)
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

// Create an axios instance with default settings
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ── Token helpers ─────────────────────────────────────────────────────────────

/** Set the JWT access token on all future requests. Also saves to localStorage. */
export function setAuthToken(token) {
  api.defaults.headers.common.Authorization = `Bearer ${token}`
  localStorage.setItem('authToken', token)
}

/** Save the refresh token to localStorage for later use. */
export function setRefreshToken(token) {
  if (token) {
    localStorage.setItem('refreshToken', token)
  }
}

/** Remove the access token (called on logout). */
export function clearAuthToken() {
  delete api.defaults.headers.common.Authorization
  localStorage.removeItem('authToken')
}

/** Remove the refresh token (called on logout). */
export function clearRefreshToken() {
  localStorage.removeItem('refreshToken')
}

/** Read the stored refresh token from localStorage. */
export function getStoredRefreshToken() {
  return localStorage.getItem('refreshToken')
}

// ── Automatic Token Refresh ───────────────────────────────────────────────────
// When a request fails with 401 (access token expired), automatically:
//   1. Use the refresh token to get a new access token
//   2. Retry the original request with the new token
//   3. If refresh also fails, log the user out

api.interceptors.response.use(
  (response) => response, // success — pass through unchanged
  async (error) => {
    const originalRequest = error.config

    // Only attempt refresh once (prevent infinite loops with _retry flag)
    if (error.response?.status === 401 && !originalRequest?._retry) {
      originalRequest._retry = true
      const refreshToken = getStoredRefreshToken()

      if (refreshToken) {
        try {
          // Call the refresh endpoint directly (not through our api instance
          // to avoid triggering this interceptor again)
          const response = await axios.post(
            `${API_BASE_URL}/auth/refresh-token`,
            { refresh_token: refreshToken },
            { headers: { 'Content-Type': 'application/json' } }
          )

          const newToken = response.data.access_token
          setAuthToken(newToken)
          setRefreshToken(response.data.refresh_token || refreshToken)

          // Retry the original failed request with the new token
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return api(originalRequest)
        } catch (refreshError) {
          // Refresh failed — clear tokens and redirect to login
          clearAuthToken()
          clearRefreshToken()
          window.location.href = '/login'
          return Promise.reject(refreshError)
        }
      }
    }

    return Promise.reject(error)
  }
)

// ── Auth endpoints ────────────────────────────────────────────────────────────

/** Log in with email/password. Returns access_token and refresh_token. */
export async function login(email, password) {
  // FastAPI's OAuth2PasswordRequestForm expects form-encoded data, not JSON
  const payload = new URLSearchParams({ username: email, password }).toString()
  return api.post('/auth/login', payload, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

/** Register a new account. Returns { user, verification_token }. */
export async function register(email, password) {
  return api.post('/auth/register', { email, password })
}

/** Verify email with the token received at registration. */
export async function verifyEmail(token) {
  return api.post('/auth/verify-email', { token })
}

/** Exchange refresh token for a new access token. */
export async function refreshTokenRequest(refreshToken) {
  return api.post('/auth/refresh-token', { refresh_token: refreshToken })
}

/** Get the currently authenticated user's profile. */
export async function getCurrentUser() {
  return api.get('/auth/me')
}

// ── User/Dashboard endpoints ──────────────────────────────────────────────────

/**
 * Get the personal analytics dashboard for the current user.
 * Returns: total_projects, subscription_plan, team_member_count, recent_activity.
 */
export async function getUserDashboard() {
  return api.get('/users/dashboard')
}

// ── Project endpoints ─────────────────────────────────────────────────────────

/**
 * Get all projects visible to the current user (owned + team projects).
 * Paginated: page=1, pageSize=20 by default.
 */
export async function getProjects(page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize
  return api.get(`/projects?skip=${skip}&limit=${pageSize}`)
}

/** Get a single project by ID (includes team info). */
export async function getProject(projectId) {
  return api.get(`/projects/${projectId}`)
}

/** Create a new project. team_id is optional (null = personal project). */
export async function createProject(name, description, team_id) {
  return api.post('/projects', { name, description, team_id })
}

/** Delete a project by ID. */
export async function deleteProject(projectId) {
  return api.delete(`/projects/${projectId}`)
}

/**
 * Get the activity timeline for a project.
 * Returns list of { id, action, user_id, timestamp }.
 */
export async function getProjectActivity(projectId) {
  return api.get(`/projects/${projectId}/activity`)
}

// ── Team endpoints ────────────────────────────────────────────────────────────

/** Get all teams the current user owns or belongs to. */
export async function getTeams() {
  return api.get('/teams')
}

/** Create a new team. Returns the created team with owner_id. */
export async function createTeam(name) {
  return api.post('/teams', { name })
}

/**
 * Invite a user to a team by email.
 * The invited user must already be registered.
 * They receive an in-app notification.
 */
export async function inviteTeamMember(teamId, email) {
  return api.post(`/teams/${teamId}/invite`, { invited_email: email })
}

/** Get all members of a specific team. */
export async function getTeamMembers(teamId) {
  return api.get(`/teams/${teamId}/members`)
}

/** Get pending invitations addressed to the current user. */
export async function getMyInvitations() {
  return api.get('/teams/invitations')
}

/**
 * Accept or decline a team invitation.
 * action: 'accepted' or 'declined'
 */
export async function respondToInvitation(invitationId, action) {
  return api.post(`/teams/invitations/${invitationId}/respond`, { action })
}

// ── Notification endpoints ────────────────────────────────────────────────────

/**
 * Get notifications for the current user (paginated).
 * Newest notifications appear first.
 */
export async function getNotifications(skip = 0, limit = 20) {
  return api.get(`/notifications?skip=${skip}&limit=${limit}`)
}

/** Mark a single notification as read by its ID. */
export async function markNotificationRead(notificationId) {
  return api.post(`/notifications/mark-read/${notificationId}`)
}

/** Mark all of the current user's notifications as read at once. */
export async function markAllNotificationsRead() {
  return api.post('/notifications/mark-read-all')
}

/**
 * Get the count of unread notifications.
 * Returns: { unread_count: N }
 * Called by AuthContext to update the navbar badge.
 */
export async function getUnreadNotificationCount() {
  return api.get('/notifications/unread-count')
}

// ── Subscription endpoints ────────────────────────────────────────────────────

/** Get the current user's active subscription details. */
export async function getSubscription() {
  return api.get('/subscriptions/my-subscription')
}

/** Create a Stripe checkout session (redirects user to Stripe payment page). */
export async function createCheckoutSession() {
  return api.post('/subscriptions/create-checkout-session')
}

/** Process a completed Stripe checkout session (called on the success page). */
export async function processCheckoutSession(sessionId) {
  return api.post(`/subscriptions/process-session/${sessionId}`)
}

// ── Admin endpoints ───────────────────────────────────────────────────────────

/**
 * Get a paginated list of all users (admin only).
 * page and pageSize control which subset to return.
 */
export async function getUsers(page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize
  return api.get(`/admin/users?skip=${skip}&limit=${pageSize}`)
}

/** Get a paginated list of all subscriptions (admin only). */
export async function getSubscriptions(page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize
  return api.get(`/admin/subscriptions?skip=${skip}&limit=${pageSize}`)
}

/**
 * Get admin analytics dashboard data (admin only).
 * Returns: total_users, free_plan_count, pro_plan_count,
 *          monthly_registrations, active_subscriptions.
 * Result is cached on the backend for 5 minutes.
 */
export async function getAdminDashboard() {
  return api.get('/admin/dashboard')
}

export default api


// ── Admin Team endpoints ──────────────────────────────────────────────────────

/**
 * Get ALL teams on the platform (admin only, paginated).
 * Returns enriched list with owner_email and member_count per team.
 * GET /admin/teams?skip=0&limit=20
 */
export async function getAdminTeams(page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize
  return api.get(`/admin/teams?skip=${skip}&limit=${pageSize}`)
}

/**
 * Get all members of a specific team (admin only).
 * Returns member list with user_email and role.
 * GET /admin/teams/{teamId}/members
 */
export async function getAdminTeamMembers(teamId) {
  return api.get(`/admin/teams/${teamId}/members`)
}

/**
 * Remove a member from any team (admin moderation).
 * member_id is the TeamMember.id (not the user's id).
 * DELETE /admin/teams/{teamId}/members/{memberId}
 */
export async function adminRemoveTeamMember(teamId, memberId) {
  return api.delete(`/admin/teams/${teamId}/members/${memberId}`)
}


// ── Admin Notification Broadcast ──────────────────────────────────────────────

/**
 * Send a system notification to all users or specific users (admin only).
 *
 * title   : notification heading
 * message : notification body
 * userIds : array of user IDs to target, or null to broadcast to everyone
 *
 * POST /admin/notifications/broadcast
 */
export async function broadcastSystemNotification(title, message, userIds = null) {
  return api.post('/admin/notifications/broadcast', {
    title,
    message,
    user_ids: userIds,
  })
}


// ════════════════════════════════════════════════════════════════════════════
// TASK API FUNCTIONS — Modules 1–6
// ════════════════════════════════════════════════════════════════════════════

// ── Module 1: Task CRUD ───────────────────────────────────────────────────

/** Create a new task inside a project. POST /projects/{id}/tasks */
export async function createTask(projectId, taskData) {
  return api.post(`/projects/${projectId}/tasks`, taskData)
}

/**
 * List tasks for a project with optional filters (Modules 1, 3, 4).
 * filterParams: { status, priority, assignee_id, overdue, due_today, due_week }
 */
export async function getTasks(projectId, filterParams = {}, skip = 0, limit = 50) {
  const params = new URLSearchParams({ skip, limit })
  if (filterParams.status) params.append('status', filterParams.status)
  if (filterParams.priority) params.append('priority', filterParams.priority)
  if (filterParams.assignee_id) params.append('assignee_id', filterParams.assignee_id)
  if (filterParams.overdue) params.append('overdue', 'true')
  if (filterParams.due_today) params.append('due_today', 'true')
  if (filterParams.due_week) params.append('due_week', 'true')
  return api.get(`/projects/${projectId}/tasks?${params.toString()}`)
}

/** Get a single task with its full activity timeline. GET /tasks/{id} */
export async function getTask(taskId) {
  return api.get(`/tasks/${taskId}`)
}

/** Update task fields (title, description, priority, assignee, due_date). PUT /tasks/{id} */
export async function updateTask(taskId, taskData) {
  return api.put(`/tasks/${taskId}`, taskData)
}

/** Delete a task permanently. DELETE /tasks/{id} */
export async function deleteTask(taskId) {
  return api.delete(`/tasks/${taskId}`)
}

// ── Module 2: Workflow Status Transitions ─────────────────────────────────

/**
 * Change task status with workflow validation. PATCH /tasks/{id}/status
 * Valid transitions: todo→in_progress, in_progress→done|blocked, blocked→in_progress
 */
export async function updateTaskStatus(taskId, newStatus) {
  return api.patch(`/tasks/${taskId}/status`, { status: newStatus })
}

// ── Module 3: Saved Filters ───────────────────────────────────────────────

/** Save a filter configuration for later reuse. POST /filters */
export async function saveFilter(name, filtersJson) {
  return api.post('/filters', { name, filters_json: filtersJson })
}

/** List all saved filters for the current user. GET /filters */
export async function getSavedFilters() {
  return api.get('/filters')
}

/** Delete a saved filter. DELETE /filters/{id} */
export async function deleteSavedFilter(filterId) {
  return api.delete(`/filters/${filterId}`)
}

/** Apply a saved filter and return matching tasks. GET /filters/{id}/apply */
export async function applySavedFilter(filterId, projectId = null) {
  const params = projectId ? `?project_id=${projectId}` : ''
  return api.get(`/filters/${filterId}/apply${params}`)
}

// ── Module 4: Deadline Tracking ───────────────────────────────────────────

/** Get all overdue tasks (due_date < now AND not done). GET /tasks/overdue */
export async function getOverdueTasks(projectId = null) {
  const params = projectId ? `?project_id=${projectId}` : ''
  return api.get(`/tasks/overdue${params}`)
}

/** Get tasks due today. GET /tasks/due-today */
export async function getTasksDueToday(projectId = null) {
  const params = projectId ? `?project_id=${projectId}` : ''
  return api.get(`/tasks/due-today${params}`)
}

/** Get tasks due within the next 7 days. GET /tasks/due-week */
export async function getTasksDueThisWeek(projectId = null) {
  const params = projectId ? `?project_id=${projectId}` : ''
  return api.get(`/tasks/due-week${params}`)
}

/** Get deadline summary counts (overdue, due today, due week). */
export async function getDeadlineSummary(projectId = null) {
  const params = projectId ? `?project_id=${projectId}` : ''
  return api.get(`/tasks/deadline-summary${params}`)
}

// ── Module 5: Kanban Grouped View ─────────────────────────────────────────

/** Get tasks grouped by status for Kanban board. GET /projects/{id}/tasks/grouped */
export async function getTasksGrouped(projectId) {
  return api.get(`/projects/${projectId}/tasks/grouped`)
}

// ── Module 6: Task Activity History ──────────────────────────────────────

/** Get full activity timeline for a task. GET /tasks/{id}/activities */
export async function getTaskActivities(taskId) {
  return api.get(`/tasks/${taskId}/activities`)
}
