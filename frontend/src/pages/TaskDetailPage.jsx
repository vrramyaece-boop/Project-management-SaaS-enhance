// frontend/src/pages/TaskDetailPage.jsx
// Task detail page — full task info + activity timeline (Module 6)
//
// Shows:
//   - Task metadata (title, status, priority, assignee, due date)
//   - Status transition buttons with workflow rules (Module 2)
//   - Inline edit form for title/description/priority/due date
//   - Full activity timeline with old/new values (Module 6)
//   - Overdue / due-today badges (Module 4)

import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getTask, updateTask, updateTaskStatus, getTaskActivities } from '../api'

const STATUS_COLORS = {
  todo:        'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  done:        'bg-green-100 text-green-700',
  blocked:     'bg-red-100 text-red-700',
}

const PRIORITY_COLORS = {
  high:   'text-red-600 bg-red-50',
  medium: 'text-yellow-600 bg-yellow-50',
  low:    'text-slate-500 bg-slate-100',
}

// Workflow: valid next statuses (mirrors backend)
const NEXT_STATUSES = {
  todo:        ['in_progress'],
  in_progress: ['done', 'blocked'],
  blocked:     ['in_progress'],
  done:        [],
}

/** Format datetime to readable string. */
function fmtDateTime(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Returns true if task is overdue. */
function isOverdue(task) {
  if (!task?.due_date || task.status === 'done') return false
  return new Date(task.due_date) < new Date()
}

/** Parse old/new JSON strings for display. */
function parseActivityValue(jsonStr) {
  if (!jsonStr) return null
  try {
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

/** Activity action badge color. */
function actionColor(action) {
  if (action === 'created') return 'bg-green-100 text-green-700'
  if (action === 'deleted') return 'bg-red-100 text-red-700'
  if (action === 'status_changed') return 'bg-blue-100 text-blue-700'
  if (action === 'assigned') return 'bg-purple-100 text-purple-700'
  return 'bg-slate-100 text-slate-600'
}

export default function TaskDetailPage() {
  const { taskId } = useParams()
  const [task, setTask] = useState(null)
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Edit form state
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({})

  useEffect(() => {
    /**
     * Load task details and its activity history in parallel.
     * getTask returns TaskWithActivities (includes activities array).
     * getTaskActivities fetches the full timeline separately for the timeline panel.
     */
    async function load() {
      setError('')
      try {
        const [taskRes, actRes] = await Promise.all([
          getTask(taskId),
          getTaskActivities(taskId),
        ])
        setTask(taskRes.data)
        setActivities(actRes.data)
        setEditData({
          title: taskRes.data.title,
          description: taskRes.data.description || '',
          priority: taskRes.data.priority,
          due_date: taskRes.data.due_date
            ? new Date(taskRes.data.due_date).toISOString().slice(0, 10)
            : '',
        })
      } catch {
        setError('Failed to load task details.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [taskId])

  /** Handle inline edit save. */
  async function handleSaveEdit(e) {
    e.preventDefault()
    setError('')
    try {
      const payload = {
        ...editData,
        due_date: editData.due_date || null,
      }
      const res = await updateTask(taskId, payload)
      setTask(res.data)
      // Reload activities to show the 'updated' entry
      const actRes = await getTaskActivities(taskId)
      setActivities(actRes.data)
      setEditing(false)
      setMessage('Task updated.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update task.')
    }
  }

  /** Handle status transition (Module 2). */
  async function handleStatusChange(newStatus) {
    setError('')
    try {
      const res = await updateTaskStatus(taskId, newStatus)
      setTask(res.data)
      const actRes = await getTaskActivities(taskId)
      setActivities(actRes.data)
      setMessage(`Status changed to "${newStatus.replace('_', ' ')}"`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid status transition.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400">Loading task…</p>
      </div>
    )
  }

  if (error && !task) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  const overdue = isOverdue(task)
  const nextStatuses = NEXT_STATUSES[task?.status] || []

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <Link
            to={`/app/projects/${task?.project_id}/tasks`}
            className="text-slate-400 hover:text-slate-700 text-sm"
          >
            ← Back to tasks
          </Link>
        </div>

        {message && (
          <p className="bg-green-50 text-green-700 px-4 py-2 rounded-xl text-sm">{message}</p>
        )}
        {error && (
          <p className="bg-red-50 text-red-700 px-4 py-2 rounded-xl text-sm">{error}</p>
        )}

        {/* ── Task Info Card ── */}
        <div className={`rounded-3xl bg-white p-8 shadow-sm border ${overdue ? 'border-red-200' : 'border-slate-100'}`}>
          {!editing ? (
            <>
              {/* View mode */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-slate-900">{task.title}</h1>
                  {task.description && (
                    <p className="text-slate-600 mt-2 leading-relaxed">{task.description}</p>
                  )}
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex-shrink-0"
                >
                  ✏ Edit
                </button>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2 mt-4">
                <span className={`text-sm px-3 py-1 rounded-full font-medium ${STATUS_COLORS[task.status]}`}>
                  {task.status.replace('_', ' ')}
                </span>
                <span className={`text-sm px-3 py-1 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}>
                  {task.priority} priority
                </span>
                {overdue && (
                  <span className="text-sm px-3 py-1 rounded-full bg-red-500 text-white font-medium">
                    ⚠ Overdue
                  </span>
                )}
              </div>

              {/* Metadata grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Due Date</p>
                  <p className={`text-sm font-medium mt-1 ${overdue ? 'text-red-600' : 'text-slate-800'}`}>
                    {task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Assigned To</p>
                  <p className="text-sm font-medium mt-1 text-slate-800">
                    {task.assigned_to ? `User #${task.assigned_to}` : 'Unassigned'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Created</p>
                  <p className="text-sm font-medium mt-1 text-slate-800">{fmtDateTime(task.created_at)}</p>
                </div>
                {task.completed_at && (
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Completed</p>
                    <p className="text-sm font-medium mt-1 text-green-600">{fmtDateTime(task.completed_at)}</p>
                  </div>
                )}
              </div>

              {/* Status transition buttons (Module 2) */}
              {nextStatuses.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500 mb-2 font-medium">Move to:</p>
                  <div className="flex gap-2 flex-wrap">
                    {nextStatuses.map(s => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        className={`rounded-xl px-4 py-2 text-sm font-medium border transition-colors ${
                          s === 'done' ? 'border-green-300 text-green-700 hover:bg-green-50' :
                          s === 'blocked' ? 'border-red-300 text-red-700 hover:bg-red-50' :
                          'border-blue-300 text-blue-700 hover:bg-blue-50'
                        }`}
                      >
                        {s === 'done' ? '✓' : s === 'blocked' ? '✕' : '→'} {s.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {task.status === 'done' && (
                <p className="text-xs text-slate-400 mt-4 italic">
                  This task is completed. Only the project owner or admin can revert it.
                </p>
              )}
            </>
          ) : (
            /* Edit mode */
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800">Edit Task</h2>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Title *</label>
                <input
                  value={editData.title}
                  onChange={e => setEditData(p => ({ ...p, title: e.target.value }))}
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Description</label>
                <textarea
                  value={editData.description}
                  onChange={e => setEditData(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Priority</label>
                  <select
                    value={editData.priority}
                    onChange={e => setEditData(p => ({ ...p, priority: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Due Date</label>
                  <input
                    type="date"
                    value={editData.due_date}
                    onChange={e => setEditData(p => ({ ...p, due_date: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="rounded-xl bg-slate-900 text-white px-5 py-2 text-sm font-medium">Save</button>
                <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-slate-200 text-slate-600 px-5 py-2 text-sm">Cancel</button>
              </div>
            </form>
          )}
        </div>

        {/* ── Activity Timeline (Module 6) ── */}
        <div className="rounded-3xl bg-white p-8 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Activity Timeline</h2>
            <span className="text-sm text-slate-400">{activities.length} event{activities.length !== 1 ? 's' : ''}</span>
          </div>

          {activities.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-slate-400 text-sm">No activity recorded yet.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-100" />

              <div className="space-y-5">
                {activities.map((act, i) => {
                  const oldVal = parseActivityValue(act.old_value_json)
                  const newVal = parseActivityValue(act.new_value_json)

                  return (
                    <div key={act.id} className="flex gap-4 relative">
                      {/* Timeline dot */}
                      <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center flex-shrink-0 z-10 text-xs">
                        {act.action === 'created' ? '✓' :
                         act.action === 'deleted' ? '✕' :
                         act.action === 'status_changed' ? '⟳' :
                         act.action === 'assigned' ? '👤' : '✎'}
                      </div>

                      {/* Activity card */}
                      <div className="flex-1 bg-slate-50 rounded-2xl p-4 mb-1">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${actionColor(act.action)}`}>
                              {act.action.replace('_', ' ')}
                            </span>
                            {i === 0 && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Latest</span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400">{fmtDateTime(act.created_at)}</span>
                        </div>

                        <p className="text-xs text-slate-500">By user #{act.user_id}</p>

                        {/* Show old → new values if available */}
                        {oldVal && newVal && Object.keys(newVal).length > 0 && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {Object.entries(newVal).map(([key, nv]) => {
                              const ov = oldVal[key]
                              return (
                                <div key={key} className="text-xs">
                                  <span className="text-slate-400 capitalize">{key.replace('_', ' ')}: </span>
                                  {ov !== undefined && ov !== nv && (
                                    <span className="line-through text-red-400 mr-1">{String(ov)}</span>
                                  )}
                                  <span className="text-green-700 font-medium">{String(nv)}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
