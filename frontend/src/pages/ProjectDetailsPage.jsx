// frontend/src/pages/ProjectDetailsPage.jsx
// Project details page — shows project info and full activity timeline.
//
// Activity timeline shows who did what and when, helping team members
// track all changes to a shared project.

import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getProject, getProjectActivity } from '../api'

/** Returns action badge color class based on the action type. */
function actionColor(action) {
  switch (action) {
    case 'created': return 'bg-green-100 text-green-700 border-green-200'
    case 'updated': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'deleted': return 'bg-red-100 text-red-700 border-red-200'
    default:        return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

/** Returns a human-readable label for each action type. */
function actionLabel(action) {
  switch (action) {
    case 'created': return '✅ Created'
    case 'updated': return '✏️ Updated'
    case 'deleted': return '🗑️ Deleted'
    default:        return action
  }
}

export default function ProjectDetailsPage() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    /**
     * Load project details and its activity timeline in parallel.
     * getProjectActivity calls GET /projects/{id}/activity which returns
     * the full list of created/updated/deleted events for this project.
     */
    async function loadDetails() {
      setError('')
      try {
        const [projectRes, activityRes] = await Promise.all([
          getProject(projectId),
          getProjectActivity(projectId),
        ])
        setProject(projectRes.data)
        setActivities(activityRes.data)
      } catch {
        setError('Unable to load project details. Please try refreshing the page.')
      } finally {
        setLoading(false)
      }
    }
    loadDetails()
  }, [projectId])

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Page header */}
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Project Details</h1>
              <p className="mt-2 text-slate-500">View project info and its full activity timeline.</p>
            </div>
            <div className="flex gap-2">
              <Link
                to="/app/projects"
                className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                ← Back to projects
              </Link>
              <Link
                to={`/app/projects/${projectId}/tasks`}
                className="inline-flex items-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
              >
                📋 Manage Tasks
              </Link>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="rounded-3xl bg-white p-8 shadow-sm animate-pulse">
            <div className="h-8 bg-slate-200 rounded w-1/2 mb-4" />
            <div className="h-4 bg-slate-100 rounded w-full mb-2" />
            <div className="h-4 bg-slate-100 rounded w-3/4" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-3xl bg-white p-8 shadow-sm">
            <p className="text-rose-700">{error}</p>
          </div>
        )}

        {/* Project info + Activity timeline */}
        {!loading && !error && project && (
          <>
            {/* Project info card */}
            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-semibold text-slate-900">{project.name}</h2>
              <p className="mt-3 text-slate-600 leading-relaxed">
                {project.description || 'No description provided.'}
              </p>

              {/* Project metadata grid */}
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Project ID
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">#{project.id}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Owner ID
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">#{project.owner_id}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Team
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {project.team_id ? `Team #${project.team_id}` : 'Personal'}
                  </p>
                </div>
              </div>
            </div>

            {/* Activity timeline card */}
            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-slate-900">Activity Timeline</h2>
                {activities.length > 0 && (
                  <span className="text-sm text-slate-400">
                    {activities.length} event{activities.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {activities.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-slate-500">No activity recorded for this project yet.</p>
                  <p className="text-slate-400 text-sm mt-1">
                    Activity is logged when the project is created, updated, or deleted.
                  </p>
                </div>
              ) : (
                <div className="relative">
                  {/* Vertical timeline line */}
                  <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-100" />

                  <div className="space-y-4">
                    {activities.map((activity, index) => (
                      <div key={activity.id} className="flex gap-4 relative">
                        {/* Timeline dot */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold border-2 bg-white z-10 ${
                          activity.action === 'created' ? 'border-green-300 text-green-600' :
                          activity.action === 'updated' ? 'border-blue-300 text-blue-600' :
                          'border-red-300 text-red-600'
                        }`}>
                          {activity.action === 'created' ? '✓' :
                           activity.action === 'updated' ? '✎' : '✕'}
                        </div>

                        {/* Activity card */}
                        <div className="flex-1 rounded-2xl border border-slate-100 bg-slate-50 p-4 mb-1">
                          <div className="flex items-center gap-2 mb-1">
                            {/* Action badge */}
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${actionColor(activity.action)}`}>
                              {actionLabel(activity.action)}
                            </span>
                            {index === 0 && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                Latest
                              </span>
                            )}
                          </div>

                          {/* Who did it */}
                          <p className="text-sm text-slate-700 mt-1">
                            By user <span className="font-medium">#{activity.user_id}</span>
                          </p>

                          {/* When */}
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(activity.timestamp).toLocaleString('en-US', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
