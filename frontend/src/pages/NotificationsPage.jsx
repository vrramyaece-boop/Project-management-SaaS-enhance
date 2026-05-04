// frontend/src/pages/NotificationsPage.jsx
// Notification list page — shows all notifications with mark-read controls.

import React, { useEffect, useState } from 'react'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api'

/** Returns a Tailwind color class based on notification type. */
function typeColor(type) {
  switch (type) {
    case 'alert':   return 'bg-red-100 text-red-700'
    case 'billing': return 'bg-yellow-100 text-yellow-700'
    case 'system':  return 'bg-purple-100 text-purple-700'
    default:        return 'bg-blue-100 text-blue-700'   // 'info'
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load notifications when the page opens
    getNotifications()
      .then(res => setNotifications(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  /** Mark one notification as read and update local state without re-fetching. */
  async function handleMarkRead(id) {
    await markNotificationRead(id).catch(() => {})
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    )
  }

  /** Mark all notifications as read and update local state. */
  async function handleMarkAllRead() {
    await markAllNotificationsRead().catch(() => {})
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-slate-500 mt-0.5">{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-sm text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5"
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl bg-white p-5 shadow-sm animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && notifications.length === 0 && (
          <div className="rounded-3xl bg-white p-12 shadow-sm text-center">
            <p className="text-5xl mb-4">🔔</p>
            <p className="text-slate-500">No notifications yet.</p>
          </div>
        )}

        {/* Notification list */}
        {notifications.map(n => (
          <div
            key={n.id}
            className={`rounded-2xl p-5 shadow-sm border transition-all ${
              n.is_read
                ? 'bg-white border-slate-100'
                : 'bg-blue-50 border-blue-200'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                {/* Type badge + title */}
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColor(n.type)}`}>
                    {n.type}
                  </span>
                  <p className="font-semibold text-slate-900">{n.title}</p>
                </div>
                {/* Message */}
                <p className="text-sm text-slate-600">{n.message}</p>
                {/* Timestamp */}
                <p className="text-xs text-slate-400 mt-2">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>

              {/* Mark as read button (only shown for unread) */}
              {!n.is_read && (
                <button
                  onClick={() => handleMarkRead(n.id)}
                  className="text-xs text-blue-600 hover:underline whitespace-nowrap flex-shrink-0"
                >
                  Mark read
                </button>
              )}
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}
