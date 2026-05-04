// frontend/src/components/Navbar.jsx
// Top navigation bar with notification badge.
//
// The bell icon shows a red badge when the user has unread notifications.
// It polls the /notifications/unread-count endpoint every 30 seconds
// to keep the count up to date without requiring a page refresh.

import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { getUnreadNotificationCount } from '../api'

export default function Navbar() {
  const { user, logout, token } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    // Only poll for notifications when the user is logged in
    if (!token) return

    /** Fetch the unread count from the backend and update state. */
    async function fetchUnreadCount() {
      try {
        const res = await getUnreadNotificationCount()
        setUnreadCount(res.data.unread_count)
      } catch {
        // Fail silently — don't crash the navbar if notifications are unavailable
      }
    }

    fetchUnreadCount()  // fetch immediately on login

    // Poll every 30 seconds so the badge stays current
    const interval = setInterval(fetchUnreadCount, 30000)

    // Cleanup: stop polling when the user logs out or the component unmounts
    return () => clearInterval(interval)
  }, [token])

  return (
    <header className="bg-white shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">

          {/* Brand logo / home link */}
          <Link to="/" className="text-xl font-semibold text-slate-900">
            SaaS Manager
          </Link>

          {/* Navigation links */}
          <nav className="flex items-center gap-4">
            <Link to="/" className="text-slate-600 hover:text-slate-900 text-sm">
              Home
            </Link>

            {/* Unauthenticated links */}
            {!token && (
              <>
                <Link to="/login" className="text-slate-600 hover:text-slate-900 text-sm">
                  Login
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-white text-sm hover:bg-slate-700"
                >
                  Register
                </Link>
              </>
            )}

            {/* Authenticated links */}
            {token && user && (
              <>
                {user.role === 'admin' ? (
                  /* Admin navigation */
                  <Link to="/admin/dashboard" className="text-slate-600 hover:text-slate-900 text-sm">
                    Admin Dashboard
                  </Link>
                ) : (
                  /* Regular user navigation */
                  <>
                    <Link to="/app/dashboard" className="text-slate-600 hover:text-slate-900 text-sm">
                      Dashboard
                    </Link>
                    <Link to="/app/projects" className="text-slate-600 hover:text-slate-900 text-sm">
                      Projects
                    </Link>
                    <Link to="/app/teams" className="text-slate-600 hover:text-slate-900 text-sm">
                      Teams
                    </Link>
                  </>
                )}

                {/* Notification bell icon with unread badge */}
                <Link to="/app/notifications" className="relative">
                  <span className="text-xl leading-none">🔔</span>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">
                      {/* Cap at 9+ to avoid overflowing the badge */}
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Link>

                {/* Logout button */}
                <button
                  onClick={logout}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-slate-600 text-sm hover:bg-slate-50"
                >
                  Logout
                </button>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  )
}
