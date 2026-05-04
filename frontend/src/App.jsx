// frontend/src/App.jsx
// Main application router — defines all page routes.
//
// Routes are split into:
//   - Public routes   : accessible without login (/, /login, /register, /verify-email)
//   - User routes     : require login (ProtectedRoute without role)
//   - Admin routes    : require login + admin role (ProtectedRoute role="admin")

import React from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { AuthProvider } from "./AuthContext"
import Navbar from "./components/Navbar"
import ProtectedRoute from "./components/ProtectedRoute"

// Public pages
import HomePage from "./pages/HomePage"
import LoginPage from "./pages/LoginPage"
import RegisterPage from "./pages/RegisterPage"
import VerifyEmailPage from "./pages/VerifyEmailPage"
import SuccessPage from "./pages/SuccessPage"
import CancelPage from "./pages/CancelPage"
import NotFoundPage from "./pages/NotFoundPage"

// User pages
import UserDashboardPage from "./pages/UserDashboardPage"
import ProjectsPage from "./pages/ProjectsPage"
import ProjectDetailsPage from "./pages/ProjectDetailsPage"
import SubscriptionPage from "./pages/SubscriptionPage"
import TeamsPage from "./pages/TeamsPage"
import NotificationsPage from "./pages/NotificationsPage"

// Task pages
import TasksPage from "./pages/TasksPage"
import TaskDetailPage from "./pages/TaskDetailPage"

// Admin pages
import AdminDashboardPage from "./pages/AdminDashboardPage"
import AdminUsersPage from "./pages/AdminUsersPage"
import AdminSubscriptionsPage from "./pages/AdminSubscriptionsPage"
import AdminTeamsPage from "./pages/AdminTeamsPage"

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-slate-50">
          <Navbar />
          <main>
            <Routes>

              {/* ── Public routes ──────────────────────────────────────── */}
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/success" element={<SuccessPage />} />
              <Route path="/cancel" element={<CancelPage />} />

              {/* ── User routes (login required) ───────────────────────── */}
              <Route
                path="/app/dashboard"
                element={<ProtectedRoute><UserDashboardPage /></ProtectedRoute>}
              />
              <Route
                path="/app/projects"
                element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>}
              />
              <Route
                path="/app/projects/:projectId"
                element={<ProtectedRoute><ProjectDetailsPage /></ProtectedRoute>}
              />
              <Route
                path="/app/subscription"
                element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>}
              />
              <Route
                path="/app/teams"
                element={<ProtectedRoute><TeamsPage /></ProtectedRoute>}
              />
              <Route
                path="/app/notifications"
                element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>}
              />

              {/* ── Admin routes (admin role required) ─────────────────── */}
              <Route
                path="/admin/dashboard"
                element={<ProtectedRoute role="admin"><AdminDashboardPage /></ProtectedRoute>}
              />
              <Route
                path="/admin/users"
                element={<ProtectedRoute role="admin"><AdminUsersPage /></ProtectedRoute>}
              />
              <Route
                path="/admin/subscriptions"
                element={<ProtectedRoute role="admin"><AdminSubscriptionsPage /></ProtectedRoute>}
              />
              {/* NEW: Admin Teams page route */}
              <Route
                path="/admin/teams"
                element={<ProtectedRoute role="admin"><AdminTeamsPage /></ProtectedRoute>}
              />

              {/* ── Task routes ───────────────────────────────────────── */}
              <Route
                path="/app/projects/:projectId/tasks"
                element={<ProtectedRoute><TasksPage /></ProtectedRoute>}
              />
              <Route
                path="/app/tasks/:taskId"
                element={<ProtectedRoute><TaskDetailPage /></ProtectedRoute>}
              />

              {/* ── 404 fallback ───────────────────────────────────────── */}
              <Route path="*" element={<NotFoundPage />} />

            </Routes>
          </main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
