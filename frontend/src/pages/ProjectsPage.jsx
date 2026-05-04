// frontend/src/pages/ProjectsPage.jsx
// Projects list page — create, delete, and view projects with inline activity.
//
// Activity tracking requirements:
//   ✅ Activity is logged on create/update/delete (done in backend projects.py)
//   ✅ Activity timeline shown in ProjectDetailsPage (dedicated page)
//   ✅ Quick activity preview shown inline in this list (expand button per project)

import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createProject,
  deleteProject,
  getProjects,
  getTeams,
  getProjectActivity,
} from '../api'

/** Returns color classes for an action badge. */
function actionBadgeClass(action) {
  if (action === 'created') return 'bg-green-100 text-green-700'
  if (action === 'updated') return 'bg-blue-100 text-blue-700'
  if (action === 'deleted') return 'bg-red-100 text-red-700'
  return 'bg-slate-100 text-slate-600'
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState([])
  const [teams, setTeams] = useState([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [teamId, setTeamId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // Track which project has its activity panel open and cache the loaded activities
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [projectActivities, setProjectActivities] = useState({})
  const [activityLoading, setActivityLoading] = useState(false)

  useEffect(() => {
    /**
     * Load projects and teams on mount.
     * Teams are needed to populate the team dropdown in the create form.
     */
    async function loadData() {
      try {
        const [projectRes, teamRes] = await Promise.all([
          getProjects(),
          getTeams().catch(() => ({ data: [] })),
        ])
        setProjects(projectRes.data)
        setTeams(teamRes.data)
      } catch {
        setError('Unable to load data. Please refresh the page.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  /** Create a new project and prepend it to the list. */
  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    try {
      const res = await createProject(name, description, teamId || null)
      setProjects(prev => [res.data, ...prev])
      setName('')
      setDescription('')
      setTeamId('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create project. Check your plan limit.')
    }
  }

  /** Delete a project and remove it from the list. */
  async function handleDelete(id) {
    setError('')
    if (!window.confirm('Delete this project? This action cannot be undone.')) return
    try {
      await deleteProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
      // If the deleted project had its activity open, close it
      if (activeProjectId === id) setActiveProjectId(null)
    } catch {
      setError('Unable to delete project. Please try again.')
    }
  }

  /**
   * Toggle the inline activity preview for a project.
   *
   * On first open: fetches activity from GET /projects/{id}/activity
   * and caches it in projectActivities so repeat opens don't re-fetch.
   * On second click: collapses the panel.
   */
  async function handleToggleActivity(projectId) {
    // Collapse if already open
    if (activeProjectId === projectId) {
      setActiveProjectId(null)
      return
    }

    setActiveProjectId(projectId)

    // Use cached activities if already loaded for this project
    if (projectActivities[projectId]) return

    setActivityLoading(true)
    try {
      const res = await getProjectActivity(projectId)
      setProjectActivities(prev => ({ ...prev, [projectId]: res.data }))
    } catch {
      setError('Unable to load project activity.')
    } finally {
      setActivityLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Page header */}
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold text-slate-900">Projects</h1>
          <p className="mt-2 text-slate-600">
            Create and manage your projects. Every action is tracked in the activity log.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">

          {/* ── Create project form ── */}
          <div className="rounded-3xl bg-white p-8 shadow-sm lg:col-span-1">
            <h2 className="text-xl font-semibold text-slate-900">New project</h2>
            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              {error && (
                <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700">Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-slate-900 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Team (optional)</label>
                <select
                  value={teamId}
                  onChange={e => setTeamId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-slate-900 focus:outline-none"
                >
                  <option value="">Personal project</option>
                  {teams.map(team => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-semibold text-white hover:bg-slate-700 transition-colors"
              >
                Create project
              </button>
            </form>
          </div>

          {/* ── Project list ── */}
          <div className="lg:col-span-2">
            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Your projects</h2>

              {loading ? (
                <div className="mt-6 space-y-4">
                  {[1,2,3].map(i => (
                    <div key={i} className="rounded-2xl border border-slate-100 p-5 animate-pulse">
                      <div className="h-5 bg-slate-200 rounded w-1/3 mb-2" />
                      <div className="h-4 bg-slate-100 rounded w-2/3" />
                    </div>
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="mt-8 text-center py-12">
                  <p className="text-4xl mb-3">📁</p>
                  <p className="text-slate-600 font-medium">No projects yet</p>
                  <p className="text-slate-400 text-sm mt-1">
                    Create your first project using the form on the left.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {projects.map(project => (
                    <div
                      key={project.id}
                      className="rounded-2xl border border-slate-200 overflow-hidden"
                    >
                      {/* ── Project summary row ── */}
                      <div className="p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-semibold text-slate-900 truncate">
                              {project.name}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                              {project.description || 'No description provided.'}
                            </p>
                            {project.team_id && (
                              <span className="inline-block mt-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                                Team #{project.team_id}
                              </span>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-2 flex-shrink-0">
                            {/* View full details page (full activity timeline) */}
                            <Link
                              to={`/app/projects/${project.id}`}
                              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              View details
                            </Link>

                            {/* Navigate to task management for this project */}
                            <Link
                              to={`/app/projects/${project.id}/tasks`}
                              className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                              📋 Tasks
                            </Link>

                            {/* Toggle inline activity preview */}
                            <button
                              onClick={() => handleToggleActivity(project.id)}
                              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                                activeProjectId === project.id
                                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {activeProjectId === project.id ? 'Hide activity' : 'Activity'}
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => handleDelete(project.id)}
                              className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* ── Inline activity preview (expands when button clicked) ── */}
                      {activeProjectId === project.id && (
                        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-slate-700">
                              Recent Activity
                            </h4>
                            <Link
                              to={`/app/projects/${project.id}`}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              View full timeline →
                            </Link>
                          </div>

                          {activityLoading && !projectActivities[project.id] ? (
                            <p className="text-sm text-slate-400 py-2">Loading activity...</p>
                          ) : !projectActivities[project.id]?.length ? (
                            <p className="text-sm text-slate-400 py-2">No activity recorded yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {/* Show last 5 activity events in the inline preview */}
                              {projectActivities[project.id].slice(0, 5).map(activity => (
                                <div
                                  key={activity.id}
                                  className="flex items-center gap-3 bg-white rounded-xl px-4 py-2.5 text-sm"
                                >
                                  {/* Action badge */}
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${actionBadgeClass(activity.action)}`}>
                                    {activity.action}
                                  </span>

                                  {/* User ID */}
                                  <span className="text-slate-500 text-xs">
                                    by user #{activity.user_id}
                                  </span>

                                  {/* Timestamp */}
                                  <span className="ml-auto text-xs text-slate-400 flex-shrink-0">
                                    {new Date(activity.timestamp).toLocaleString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              ))}
                              {projectActivities[project.id].length > 5 && (
                                <p className="text-xs text-slate-400 text-center pt-1">
                                  +{projectActivities[project.id].length - 5} more events —{' '}
                                  <Link to={`/app/projects/${project.id}`} className="text-blue-600 hover:underline">
                                    view all
                                  </Link>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
