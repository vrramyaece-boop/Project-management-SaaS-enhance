// frontend/src/pages/UserDashboardPage.jsx
// User personal analytics dashboard with Recharts visualization.
//
// Requirements covered:
//   ✅ Total projects (stat card + number)
//   ✅ Active subscription status (status badge + plan + renewal date)
//   ✅ Number of team members (stat card)
//   ✅ Recent project activity (timeline with Recharts BarChart of action counts)

import React, { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { getSubscription, getUserDashboard, getDeadlineSummary } from '../api'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

// ── Color helpers ─────────────────────────────────────────────────────────────

/** Returns Tailwind color class based on subscription status string. */
function statusColor(status) {
  if (!status) return 'bg-slate-100 text-slate-500'
  if (status === 'active') return 'bg-green-100 text-green-700'
  if (status === 'canceled' || status === 'cancelled') return 'bg-red-100 text-red-600'
  return 'bg-yellow-100 text-yellow-700'
}

/** Returns fill color for the activity bar chart based on action type. */
function actionBarColor(action) {
  if (action === 'created') return '#16a34a'   // green
  if (action === 'updated') return '#2563eb'   // blue
  if (action === 'deleted') return '#dc2626'   // red
  return '#64748b'
}

/**
 * Custom tooltip for the activity bar chart.
 * Shows action name and count when hovering a bar.
 */
function ActivityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-lg text-sm">
      <p className="font-semibold text-slate-800 capitalize">{label}</p>
      <p className="text-slate-600 mt-0.5">{payload[0].value} event{payload[0].value !== 1 ? 's' : ''}</p>
    </div>
  )
}

export default function UserDashboardPage() {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deadlineSummary, setDeadlineSummary] = useState(null)

  useEffect(() => {
    /**
     * Load subscription info and dashboard stats in parallel.
     * .catch() on each prevents one failure from blocking the other.
     */
    async function fetchData() {
      try {
        const [subRes, dashRes, deadlineRes] = await Promise.all([
          getSubscription().catch(() => ({ data: null })),
          getUserDashboard().catch(() => ({ data: null })),
          getDeadlineSummary().catch(() => ({ data: null })),
        ])
        setSubscription(subRes.data)
        setDashboard(dashRes.data)
        setDeadlineSummary(deadlineRes.data)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  /**
   * Build activity summary chart data.
   * Counts how many times each action (created/updated/deleted) appears
   * in the recent_activity list — gives a quick visual of what kind of
   * activity is happening most.
   *
   * Example output: [{ action: 'created', count: 5 }, { action: 'updated', count: 3 }, ...]
   */
  const activityChartData = dashboard?.recent_activity?.length
    ? ['created', 'updated', 'deleted'].map(action => ({
        action,
        count: dashboard.recent_activity.filter(a => a.action === action).length,
      }))
    : []

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ── Welcome header ── */}
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold text-slate-900">
            Welcome back, {user?.email}
          </h1>
          <p className="mt-2 text-slate-500 capitalize">Role: {user?.role}</p>
        </div>

        {/* ── 4 analytics stat cards ── */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="rounded-2xl bg-white p-6 shadow-sm animate-pulse">
                <div className="h-10 bg-slate-200 rounded mb-2" />
                <div className="h-4 bg-slate-100 rounded w-2/3 mx-auto" />
              </div>
            ))}
          </div>
        ) : dashboard && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Card 1 — Total Projects */}
            <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
              <p className="text-4xl font-bold text-slate-900">
                {dashboard.total_projects}
              </p>
              <p className="text-sm text-slate-500 mt-1">Total Projects</p>
              <Link to="/app/projects" className="text-xs text-blue-600 hover:underline mt-2 block">
                View all →
              </Link>
            </div>

            {/* Card 2 — Current Plan */}
            <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
              <p className="text-4xl font-bold text-slate-900 capitalize">
                {dashboard.subscription_plan}
              </p>
              <p className="text-sm text-slate-500 mt-1">Current Plan</p>
              {dashboard.subscription_plan === 'free' && (
                <Link to="/app/subscription" className="text-xs text-blue-600 hover:underline mt-2 block">
                  Upgrade to Pro →
                </Link>
              )}
            </div>

            {/* Card 3 — Active Subscription Status */}
            <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
              <div className="flex justify-center">
                <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${statusColor(subscription?.status)}`}>
                  {subscription?.status
                    ? subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)
                    : 'Free'}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-2">Subscription Status</p>
              {subscription?.current_period_end && (
                <p className="text-xs text-slate-400 mt-1">
                  Renews {new Date(subscription.current_period_end).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Card 4 — Team Members */}
            <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
              <p className="text-4xl font-bold text-slate-900">
                {dashboard.team_member_count}
              </p>
              <p className="text-sm text-slate-500 mt-1">Team Members</p>
              <Link to="/app/teams" className="text-xs text-blue-600 hover:underline mt-2 block">
                Manage teams →
              </Link>
            </div>

          </div>
        )}

        {/* ── Charts + Subscription row ── */}
        {!loading && dashboard && (
          <div className="grid gap-6 lg:grid-cols-2">

            {/* ── Recent Activity bar chart (Recharts) ── */}
            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900 mb-1">
                Activity Summary
              </h2>
              <p className="text-sm text-slate-400 mb-4">
                Breakdown of recent project actions
              </p>

              {activityChartData.every(d => d.count === 0) ? (
                <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
                  No activity recorded yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={activityChartData}
                    margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="action"
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ActivityTooltip />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {activityChartData.map((entry) => (
                        <Cell key={entry.action} fill={actionBarColor(entry.action)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Subscription details card ── */}
            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">
                Subscription Details
              </h2>
              {subscription ? (
                <div className="space-y-3 text-slate-600">
                  <div className="flex justify-between items-center py-2 border-b border-slate-50">
                    <span className="text-sm">Plan</span>
                    <span className="font-semibold capitalize text-slate-900">
                      {subscription.plan}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-50">
                    <span className="text-sm">Status</span>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusColor(subscription.status)}`}>
                      {subscription.status?.toUpperCase()}
                    </span>
                  </div>
                  {subscription.current_period_end && (
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm">Next renewal</span>
                      <span className="font-medium text-slate-900 text-sm">
                        {new Date(subscription.current_period_end).toLocaleDateString('en-US', {
                          month: 'long', day: 'numeric', year: 'numeric'
                        })}
                      </span>
                    </div>
                  )}
                  <Link
                    to="/app/subscription"
                    className="block mt-2 text-center rounded-xl border border-slate-200 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Manage subscription
                  </Link>
                </div>
              ) : (
                <div>
                  <p className="text-slate-500 mb-4 text-sm leading-relaxed">
                    You are on the <strong>Free plan</strong> — limited to 3 projects.
                    Upgrade to Pro for unlimited projects and team features.
                  </p>
                  <Link
                    to="/app/subscription"
                    className="block text-center rounded-xl bg-slate-900 py-3 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
                  >
                    Upgrade to Pro
                  </Link>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── Recent project activity timeline ── */}
        {!loading && dashboard?.recent_activity?.length > 0 && (
          <div className="rounded-3xl bg-white p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">Recent Activity</h2>
              <span className="text-sm text-slate-400">Last 10 events</span>
            </div>
            <div className="space-y-2">
              {dashboard.recent_activity.map(activity => (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0"
                >
                  {/* Action badge */}
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${
                    activity.action === 'created' ? 'bg-green-100 text-green-700' :
                    activity.action === 'updated' ? 'bg-blue-100 text-blue-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {activity.action}
                  </span>

                  {/* Clickable project link */}
                  <Link
                    to={`/app/projects/${activity.project_id}`}
                    className="text-sm text-slate-700 hover:text-blue-600 hover:underline"
                  >
                    Project #{activity.project_id}
                  </Link>

                  {/* Timestamp (right-aligned) */}
                  <span className="ml-auto text-xs text-slate-400 flex-shrink-0">
                    {new Date(activity.timestamp).toLocaleString('en-US', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
            <Link
              to="/app/projects"
              className="block text-center mt-4 text-sm text-slate-400 hover:text-slate-700"
            >
              View all projects →
            </Link>
          </div>
        )}

        {/* ── Empty activity state ── */}
        {!loading && dashboard?.recent_activity?.length === 0 && (
          <div className="rounded-3xl bg-white p-10 shadow-sm text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-slate-600 font-medium">No activity yet</p>
            <p className="text-slate-400 text-sm mt-1">
              Create your first project to start tracking activity here.
            </p>
            <Link
              to="/app/projects"
              className="inline-block mt-4 rounded-xl bg-slate-900 px-6 py-2.5 text-white text-sm hover:bg-slate-700"
            >
              Create a project
            </Link>
          </div>
        )}


        {/* ── Task Deadline Widgets (Module 4) ── */}
        {/* Always shown after loading — shows 0 when no tasks have due dates */}
        {!loading && (
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Task Deadlines</h2>
              <span className="text-xs text-slate-400">Across all your projects</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className={`rounded-2xl p-4 text-center border ${
                (deadlineSummary?.overdue_count ?? 0) > 0
                  ? 'bg-red-50 border-red-200'
                  : 'bg-slate-50 border-slate-100'
              }`}>
                <p className={`text-3xl font-bold ${
                  (deadlineSummary?.overdue_count ?? 0) > 0 ? 'text-red-600' : 'text-slate-400'
                }`}>
                  {deadlineSummary?.overdue_count ?? 0}
                </p>
                <p className="text-xs text-slate-500 mt-1">⚠ Overdue</p>
              </div>
              <div className={`rounded-2xl p-4 text-center border ${
                (deadlineSummary?.due_today_count ?? 0) > 0
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-slate-50 border-slate-100'
              }`}>
                <p className={`text-3xl font-bold ${
                  (deadlineSummary?.due_today_count ?? 0) > 0 ? 'text-amber-600' : 'text-slate-400'
                }`}>
                  {deadlineSummary?.due_today_count ?? 0}
                </p>
                <p className="text-xs text-slate-500 mt-1">🔔 Due Today</p>
              </div>
              <div className={`rounded-2xl p-4 text-center border ${
                (deadlineSummary?.due_this_week_count ?? 0) > 0
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-slate-50 border-slate-100'
              }`}>
                <p className={`text-3xl font-bold ${
                  (deadlineSummary?.due_this_week_count ?? 0) > 0 ? 'text-blue-600' : 'text-slate-400'
                }`}>
                  {deadlineSummary?.due_this_week_count ?? 0}
                </p>
                <p className="text-xs text-slate-500 mt-1">📅 Due This Week</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3 text-center">
              {(deadlineSummary?.overdue_count ?? 0) === 0 &&
               (deadlineSummary?.due_today_count ?? 0) === 0 &&
               (deadlineSummary?.due_this_week_count ?? 0) === 0
                ? 'No upcoming task deadlines. Create tasks with due dates to track them here.'
                : 'Click Projects to manage your tasks and deadlines.'}
            </p>
          </div>
        )}

        {/* ── Quick links ── */}
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { to: '/app/projects',      icon: '📁', label: 'Projects'      },
              { to: '/app/teams',         icon: '👥', label: 'Teams'         },
              { to: '/app/notifications', icon: '🔔', label: 'Notifications' },
              { to: '/app/subscription',  icon: '💳', label: 'Subscription'  },
              { to: '/app/projects',      icon: '📋', label: 'Tasks'         },
            ].map(link => (
              <Link
                key={link.to}
                to={link.to}
                className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 px-4 py-4 text-slate-700 hover:bg-slate-50 transition-colors text-center"
              >
                <span className="text-2xl">{link.icon}</span>
                <span className="text-xs font-medium text-slate-600">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
