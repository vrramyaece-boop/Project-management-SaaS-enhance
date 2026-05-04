// frontend/src/pages/TasksPage.jsx
// Task Management page — Table view + Kanban board + Filters (Modules 1,2,3,4,5)
//
// Features:
//   - Toggle between Table view and Kanban board
//   - Filter panel (status, priority, assignee, overdue, due today, due week)
//   - Saved views dropdown (Module 3)
//   - Deadline badges on each task (Module 4)
//   - Status update buttons with workflow validation (Module 2)
//   - Create / delete tasks (Module 1)
//   - Link to task detail page for full activity timeline (Module 6)

import React, { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getTasks, createTask, deleteTask, updateTaskStatus,
  getTasksGrouped, getSavedFilters, saveFilter, deleteSavedFilter, applySavedFilter,
  getDeadlineSummary,
} from '../api'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  todo:        'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  done:        'bg-green-100 text-green-700',
  blocked:     'bg-red-100 text-red-700',
}

const PRIORITY_COLORS = {
  high:   'bg-red-50 text-red-700 border border-red-200',
  medium: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  low:    'bg-slate-50 text-slate-600 border border-slate-200',
}

// Valid next statuses per current status (mirrors backend ALLOWED_TRANSITIONS)
const NEXT_STATUSES = {
  todo:        ['in_progress'],
  in_progress: ['done', 'blocked'],
  blocked:     ['in_progress'],
  done:        [],
}

/** Returns true if the task is overdue. */
function isOverdue(task) {
  if (!task.due_date || task.status === 'done') return false
  return new Date(task.due_date) < new Date()
}

/** Returns true if the task is due today. */
function isDueToday(task) {
  if (!task.due_date || task.status === 'done') return false
  const due = new Date(task.due_date)
  const today = new Date()
  return (
    due.getFullYear() === today.getFullYear() &&
    due.getMonth() === today.getMonth() &&
    due.getDate() === today.getDate()
  )
}

/** Format a datetime string to a readable date. */
function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Single task card used in both Table rows and Kanban columns. */
function TaskCard({ task, onStatusChange, onDelete, compact = false }) {
  const overdue = isOverdue(task)
  const dueToday = isDueToday(task)
  const nextStatuses = NEXT_STATUSES[task.status] || []

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${overdue ? 'border-red-200' : 'border-slate-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Title + link to detail page */}
          <Link to={`/app/tasks/${task.id}`} className="font-medium text-slate-900 hover:text-blue-600 hover:underline text-sm block truncate">
            {task.title}
          </Link>
          {!compact && task.description && (
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{task.description}</p>
          )}
        </div>
        {/* Delete button */}
        <button onClick={() => onDelete(task.id)} className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 text-xs">✕</button>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[task.status]}`}>
          {task.status.replace('_', ' ')}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}>
          {task.priority}
        </span>
        {overdue && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white font-medium">⚠ Overdue</span>
        )}
        {dueToday && !overdue && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-white font-medium">Due today</span>
        )}
      </div>

      {/* Due date */}
      {task.due_date && (
        <p className={`text-xs mt-2 ${overdue ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
          Due: {fmtDate(task.due_date)}
        </p>
      )}

      {/* Status transition buttons (Module 2) */}
      {nextStatuses.length > 0 && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {nextStatuses.map(s => (
            <button
              key={s}
              onClick={() => onStatusChange(task.id, s)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              → {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { projectId } = useParams()

  // View state
  const [view, setView] = useState('table')  // 'table' | 'kanban'
  const [tasks, setTasks] = useState([])
  const [grouped, setGrouped] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Deadline summary (Module 4)
  const [deadlineSummary, setDeadlineSummary] = useState(null)

  // Filter state (Module 3)
  const [filters, setFilters] = useState({ status: '', priority: '', overdue: false, due_today: false, due_week: false })
  const [showFilterPanel, setShowFilterPanel] = useState(false)

  // Saved filters (Module 3)
  const [savedFilters, setSavedFilters] = useState([])
  const [filterName, setFilterName] = useState('')

  // Create task form state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium', status: 'todo', due_date: '' })

  // Load tasks from backend applying current filters
  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const activeFilters = {
        ...(filters.status && { status: filters.status }),
        ...(filters.priority && { priority: filters.priority }),
        ...(filters.overdue && { overdue: true }),
        ...(filters.due_today && { due_today: true }),
        ...(filters.due_week && { due_week: true }),
      }
      if (view === 'kanban') {
        const res = await getTasksGrouped(projectId)
        setGrouped(res.data)
      } else {
        const res = await getTasks(projectId, activeFilters)
        setTasks(res.data)
      }
    } catch {
      setError('Failed to load tasks.')
    } finally {
      setLoading(false)
    }
  }, [projectId, filters, view])

  useEffect(() => {
    loadTasks()
    // Load saved filters and deadline summary in parallel
    getSavedFilters().then(r => setSavedFilters(r.data)).catch(() => {})
    getDeadlineSummary(projectId).then(r => setDeadlineSummary(r.data)).catch(() => {})
  }, [loadTasks])

  // Create task
  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    try {
      const payload = { ...newTask, due_date: newTask.due_date || null }
      await createTask(projectId, payload)
      setNewTask({ title: '', description: '', priority: 'medium', status: 'todo', due_date: '' })
      setShowCreateForm(false)
      setMessage('Task created!')
      loadTasks()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create task.')
    }
  }

  // Delete task
  async function handleDelete(taskId) {
    if (!window.confirm('Delete this task?')) return
    try {
      await deleteTask(taskId)
      loadTasks()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete task.')
    }
  }

  // Status change (Module 2)
  async function handleStatusChange(taskId, newStatus) {
    setError('')
    try {
      await updateTaskStatus(taskId, newStatus)
      loadTasks()
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid status transition.')
    }
  }

  // Save current filter (Module 3)
  async function handleSaveFilter() {
    if (!filterName.trim()) return
    try {
      await saveFilter(filterName, JSON.stringify(filters))
      setFilterName('')
      getSavedFilters().then(r => setSavedFilters(r.data))
      setMessage('Filter saved!')
    } catch {
      setError('Failed to save filter.')
    }
  }

  // Apply a saved filter (Module 3)
  async function handleApplyFilter(filterId) {
    try {
      const res = await applySavedFilter(filterId, projectId)
      setTasks(res.data)
      setView('table')
    } catch {
      setError('Failed to apply filter.')
    }
  }

  // Delete a saved filter (Module 3)
  async function handleDeleteFilter(filterId) {
    try {
      await deleteSavedFilter(filterId)
      setSavedFilters(prev => prev.filter(f => f.id !== filterId))
    } catch {
      setError('Failed to delete filter.')
    }
  }

  const KANBAN_COLS = ['todo', 'in_progress', 'blocked', 'done']

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
            <Link to={`/app/projects/${projectId}`} className="text-sm text-slate-400 hover:text-slate-600">← Back to project</Link>
          </div>
          <div className="flex gap-2">
            {/* View toggle (Module 5) */}
            <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm">
              <button onClick={() => setView('table')} className={`px-4 py-2 font-medium transition-colors ${view === 'table' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>☰ Table</button>
              <button onClick={() => setView('kanban')} className={`px-4 py-2 font-medium transition-colors ${view === 'kanban' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>⧫ Kanban</button>
            </div>
            <button onClick={() => setShowFilterPanel(p => !p)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">⚙ Filters</button>
            <button onClick={() => setShowCreateForm(p => !p)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">+ New task</button>
          </div>
        </div>

        {/* Status messages */}
        {message && <p className="bg-green-50 text-green-700 px-4 py-2 rounded-xl text-sm">{message}</p>}
        {error && <p className="bg-red-50 text-red-700 px-4 py-2 rounded-xl text-sm">{error}</p>}

        {/* ── Deadline summary widgets (Module 4) ── */}
        {deadlineSummary && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Overdue', value: deadlineSummary.overdue_count, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
              { label: 'Due Today', value: deadlineSummary.due_today_count, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
              { label: 'Due This Week', value: deadlineSummary.due_this_week_count, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
            ].map(w => (
              <div key={w.label} className={`rounded-2xl border p-4 text-center ${w.bg}`}>
                <p className={`text-3xl font-bold ${w.color}`}>{w.value}</p>
                <p className="text-xs text-slate-500 mt-1">{w.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Filter panel (Module 3) ── */}
        {showFilterPanel && (
          <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
            <h3 className="font-semibold text-slate-800">Filter Tasks</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Status</label>
                <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">All</option>
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Priority</label>
                <select value={filters.priority} onChange={e => setFilters(p => ({ ...p, priority: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">All</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-600">Quick filters</label>
                {[['overdue', '⚠ Overdue'], ['due_today', 'Due Today'], ['due_week', 'Due This Week']].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={filters[key]} onChange={e => setFilters(p => ({ ...p, [key]: e.target.checked }))} className="rounded" />
                    {label}
                  </label>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={loadTasks} className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm">Apply</button>
                <button onClick={() => setFilters({ status: '', priority: '', overdue: false, due_today: false, due_week: false })} className="rounded-lg border border-slate-200 text-slate-600 px-4 py-2 text-sm">Clear</button>
              </div>
            </div>

            {/* Save current filter */}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <input value={filterName} onChange={e => setFilterName(e.target.value)} placeholder="Save as view name…"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <button onClick={handleSaveFilter} className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm">Save view</button>
            </div>

            {/* Saved views dropdown */}
            {savedFilters.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-medium text-slate-500 mb-2">Saved views</p>
                <div className="flex flex-wrap gap-2">
                  {savedFilters.map(f => (
                    <div key={f.id} className="flex items-center gap-1 bg-slate-100 rounded-lg px-3 py-1.5">
                      <button onClick={() => handleApplyFilter(f.id)} className="text-sm text-slate-700 hover:text-blue-600">{f.name}</button>
                      <button onClick={() => handleDeleteFilter(f.id)} className="text-slate-400 hover:text-red-500 text-xs ml-1">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Create task form (Module 1) ── */}
        {showCreateForm && (
          <div className="rounded-2xl bg-white border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-800 mb-4">Create New Task</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
                placeholder="Task title *" required
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm" />
              <textarea value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))}
                placeholder="Description (optional)" rows={2}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm resize-none" />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Priority</label>
                  <select value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Initial status</label>
                  <select value={newTask.status} onChange={e => setNewTask(p => ({ ...p, status: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Due date</label>
                  <input type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" className="rounded-xl bg-slate-900 text-white px-5 py-2 text-sm font-medium">Create</button>
                <button type="button" onClick={() => setShowCreateForm(false)} className="rounded-xl border border-slate-200 text-slate-600 px-5 py-2 text-sm">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* ── TABLE VIEW (Module 5) ── */}
        {view === 'table' && (
          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Loading tasks…</div>
            ) : tasks.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-slate-500">No tasks found. Create one above.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Title</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Priority</th>
                    <th className="text-left px-4 py-3 font-medium">Due Date</th>
                    <th className="text-left px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(task => {
                    const overdue = isOverdue(task)
                    const dueToday = isDueToday(task)
                    const nextStatuses = NEXT_STATUSES[task.status] || []
                    return (
                      <tr key={task.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${overdue ? 'bg-red-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <Link to={`/app/tasks/${task.id}`} className="font-medium text-slate-900 hover:text-blue-600 hover:underline">
                            {task.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[task.status]}`}>
                            {task.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}>
                            {task.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {task.due_date ? (
                            <span className={`text-xs font-medium ${overdue ? 'text-red-600' : dueToday ? 'text-amber-600' : 'text-slate-600'}`}>
                              {overdue && '⚠ '}{dueToday && '🔔 '}{fmtDate(task.due_date)}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {nextStatuses.map(s => (
                              <button key={s} onClick={() => handleStatusChange(task.id, s)}
                                className="text-xs border border-slate-200 rounded px-2 py-0.5 text-slate-600 hover:bg-slate-100">
                                → {s.replace('_', ' ')}
                              </button>
                            ))}
                            <button onClick={() => handleDelete(task.id)}
                              className="text-xs border border-red-200 rounded px-2 py-0.5 text-red-600 hover:bg-red-50 ml-1">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── KANBAN VIEW (Module 5) ── */}
        {view === 'kanban' && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {KANBAN_COLS.map(col => (
              <div key={col} className="rounded-2xl bg-white border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700 capitalize">{col.replace('_', ' ')}</h3>
                  <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
                    {grouped?.[col]?.length ?? 0}
                  </span>
                </div>
                {loading ? (
                  <div className="h-24 bg-slate-50 rounded-xl animate-pulse" />
                ) : (
                  <div className="space-y-2">
                    {(grouped?.[col] || []).map(task => (
                      <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onDelete={handleDelete} compact />
                    ))}
                    {(grouped?.[col] || []).length === 0 && (
                      <p className="text-xs text-slate-300 text-center py-4">No tasks</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
