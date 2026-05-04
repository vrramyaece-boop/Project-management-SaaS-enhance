// frontend/src/pages/AdminDashboardPage.jsx
// Admin analytics dashboard — all 4 required metrics with Recharts visualizations.
//
// Requirements covered:
//   ✅ Total registered users (stat card)
//   ✅ Free vs Pro plan distribution (Recharts PieChart / DonutChart)
//   ✅ Monthly user registrations (Recharts BarChart)
//   ✅ Active subscriptions (stat card)
//   ✅ Admin system notification broadcast form

import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAdminDashboard, broadcastSystemNotification } from '../api'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

// ── Recharts colour palette ───────────────────────────────────────────────────
// Free plan → slate grey, Pro plan → blue
const PIE_COLORS = ['#64748b', '#2563eb']

/**
 * Custom tooltip shown when hovering a bar in the monthly registrations chart.
 * Displays the full YYYY-MM month and the count of new signups.
 */
function MonthlyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-lg text-sm">
      <p className="font-semibold text-slate-800">{label}</p>
      <p className="text-blue-600 mt-0.5">
        {payload[0].value} new user{payload[0].value !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

/**
 * Custom tooltip shown when hovering a slice in the plan distribution pie chart.
 */
function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-lg text-sm">
      <p className="font-semibold text-slate-800">{payload[0].name} Plan</p>
      <p className="text-slate-600 mt-0.5">{payload[0].value} subscription{payload[0].value !== 1 ? 's' : ''}</p>
    </div>
  )
}

export default function AdminDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Admin notification broadcast form state
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMessage, setNotifMessage] = useState('')
  const [notifUserIds, setNotifUserIds] = useState('')
  const [notifSending, setNotifSending] = useState(false)
  const [notifResult, setNotifResult] = useState('')

  useEffect(() => {
    /**
     * Load admin analytics on mount.
     * Backend caches this result for 5 minutes so repeat loads are instant.
     */
    getAdminDashboard()
      .then(res => setData(res.data))
      .catch(() => setError('Failed to load dashboard data. Please refresh.'))
      .finally(() => setLoading(false))
  }, [])

  /**
   * Build the pie chart data array from the free/pro counts.
   * Recharts PieChart expects: [{ name, value }, ...]
   */
  const planDistributionData = data
    ? [
        { name: 'Free', value: data.free_plan_count ?? 0 },
        { name: 'Pro',  value: data.pro_plan_count  ?? 0 },
      ]
    : []

  /**
   * Handle admin broadcast form submit.
   * Parses comma-separated user IDs → array, or null for broadcast to all.
   */
  async function handleBroadcast(e) {
    e.preventDefault()
    setNotifResult('')
    setNotifSending(true)
    try {
      const userIds = notifUserIds.trim()
        ? notifUserIds.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
        : null
      const res = await broadcastSystemNotification(notifTitle, notifMessage, userIds)
      setNotifResult(res.data.message)
      setNotifTitle('')
      setNotifMessage('')
      setNotifUserIds('')
    } catch (err) {
      setNotifResult(err.response?.data?.detail || 'Failed to send notification.')
    } finally {
      setNotifSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ── Page header ── */}
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold text-slate-900">Admin Dashboard</h1>
          <p className="mt-2 text-slate-500">
            Platform analytics — data refreshed every 5 minutes.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 px-6 py-4 rounded-2xl">{error}</div>
        )}

        {/* ── 4 key stat cards ── */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="rounded-2xl bg-white p-6 shadow-sm animate-pulse">
                <div className="h-10 bg-slate-200 rounded mb-2" />
                <div className="h-4 bg-slate-100 rounded w-2/3 mx-auto" />
              </div>
            ))}
          </div>
        ) : data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total registered users */}
            <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
              <p className="text-4xl font-bold text-slate-900">{data.total_users ?? 0}</p>
              <p className="text-sm text-slate-500 mt-1">Total Users</p>
            </div>
            {/* Card 2: Active subscriptions */}
            <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
              <p className="text-4xl font-bold text-green-600">{data.active_subscriptions ?? 0}</p>
              <p className="text-sm text-slate-500 mt-1">Active Subscriptions</p>
            </div>
            {/* Card 3: Total teams */}
            <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
              <p className="text-4xl font-bold text-purple-600">{data.total_teams ?? 0}</p>
              <p className="text-sm text-slate-500 mt-1">Total Teams</p>
            </div>
            {/* Card 4: Pro plan users */}
            <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
              <p className="text-4xl font-bold text-blue-600">{data.pro_plan_count ?? 0}</p>
              <p className="text-sm text-slate-500 mt-1">Pro Plan Users</p>
            </div>
          </div>
        )}

        {/* ── Charts row: Free vs Pro donut + Monthly registrations bar ── */}
        {!loading && data && (
          <div className="grid gap-6 lg:grid-cols-2">

            {/* ── Free vs Pro plan distribution — Recharts PieChart ── */}
            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900 mb-1">
                Plan Distribution
              </h2>
              <p className="text-sm text-slate-400 mb-4">Free vs Pro subscriptions</p>

              {planDistributionData.every(d => d.value === 0) ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
                  No subscription data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={planDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}   // innerRadius makes it a donut chart
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {planDistributionData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend
                      formatter={(value) => (
                        <span className="text-sm text-slate-700">{value} Plan</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}

              {/* Numeric breakdown below the chart */}
              <div className="flex justify-around mt-2 pt-4 border-t border-slate-50">
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-600">
                    {data.free_plan_count ?? 0}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Free Plan</p>
                </div>
                <div className="w-px bg-slate-100" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {data.pro_plan_count ?? 0}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Pro Plan</p>
                </div>
              </div>
            </div>

            {/* ── Monthly user registrations — Recharts BarChart ── */}
            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900 mb-1">
                Monthly Registrations
              </h2>
              <p className="text-sm text-slate-400 mb-4">New user signups per month</p>

              {!data.monthly_registrations?.length ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
                  No registration data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={data.monthly_registrations}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickFormatter={m => m.slice(5)}  // "2025-01" → "01"
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<MonthlyTooltip />} />
                    <Bar
                      dataKey="count"
                      fill="#1e293b"
                      radius={[4, 4, 0, 0]}   // rounded top corners
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

          </div>
        )}

        {/* ── Admin System Notification Broadcast ── */}
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-1">
            Send System Notification
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            Broadcast an announcement to all users, or target specific user IDs.
          </p>
          <form onSubmit={handleBroadcast} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                value={notifTitle}
                onChange={e => setNotifTitle(e.target.value)}
                placeholder="e.g. Scheduled Maintenance Tonight"
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Message <span className="text-red-500">*</span>
              </label>
              <textarea
                value={notifMessage}
                onChange={e => setNotifMessage(e.target.value)}
                placeholder="e.g. The platform will be unavailable from 2–4 AM UTC."
                required
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Target Users (optional)
              </label>
              <input
                value={notifUserIds}
                onChange={e => setNotifUserIds(e.target.value)}
                placeholder="e.g. 1,2,3 — leave blank to send to ALL users"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
              <p className="text-xs text-slate-400 mt-1">
                Comma-separated user IDs. Leave blank to broadcast to everyone.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={notifSending}
                className="rounded-xl bg-slate-900 px-6 py-3 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {notifSending ? 'Sending...' : 'Send Notification'}
              </button>
              {notifResult && (
                <p className={`text-sm ${
                  notifResult.toLowerCase().includes('fail') ? 'text-red-600' : 'text-green-600'
                }`}>
                  {notifResult}
                </p>
              )}
            </div>
          </form>
        </div>

        {/* ── Platform management links ── */}
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Manage Platform</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { to: '/admin/users',         label: '👤 Manage Users'       },
              { to: '/admin/subscriptions', label: '💳 View Subscriptions' },
              { to: '/admin/teams',         label: '👥 Manage Teams'       },
            ].map(link => (
              <Link
                key={link.to}
                to={link.to}
                className="block rounded-xl border border-slate-200 px-5 py-4 text-slate-700 hover:bg-slate-50 font-medium transition-colors text-center"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
