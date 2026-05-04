// frontend/src/pages/AdminTeamsPage.jsx
// Admin Teams Management page — view all teams and their members.
//
// This page is only accessible by users with role='admin'.
// It allows admins to:
//   - See all teams on the platform (paginated)
//   - Expand any team to see its full member list with emails
//   - Remove members from any team (moderation)

import React, { useEffect, useState } from 'react'
import { getAdminTeams, getAdminTeamMembers, adminRemoveTeamMember } from '../api'

export default function AdminTeamsPage() {
  // All teams loaded from the backend
  const [teams, setTeams] = useState([])
  // Track which team is expanded to show members
  const [expandedTeamId, setExpandedTeamId] = useState(null)
  // Cache members per team so we don't re-fetch on collapse/expand
  const [membersMap, setMembersMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [memberLoading, setMemberLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  // Pagination state
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 20

  useEffect(() => {
    // Load first page of teams when the component mounts
    loadTeams(1)
  }, [])

  /**
   * Fetch a page of teams from the admin endpoint.
   * Appends results so the admin can "load more" without losing previous data.
   */
  async function loadTeams(pageNum) {
    setLoading(true)
    try {
      const res = await getAdminTeams(pageNum, PAGE_SIZE)
      const newTeams = res.data
      setTeams(prev => pageNum === 1 ? newTeams : [...prev, ...newTeams])
      setHasMore(newTeams.length === PAGE_SIZE)  // if less than a full page, no more data
      setPage(pageNum)
    } catch {
      setError('Failed to load teams. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Toggle the expanded member list for a team.
   * Loads members from the backend on first expand, then uses the cache.
   */
  async function toggleMembers(teamId) {
    // Collapse if already expanded
    if (expandedTeamId === teamId) {
      setExpandedTeamId(null)
      return
    }

    setExpandedTeamId(teamId)

    // Use cached members if already loaded
    if (membersMap[teamId]) return

    setMemberLoading(true)
    try {
      const res = await getAdminTeamMembers(teamId)
      // Cache the result so we don't hit the server again on re-expand
      setMembersMap(prev => ({ ...prev, [teamId]: res.data }))
    } catch {
      setError('Failed to load team members.')
    } finally {
      setMemberLoading(false)
    }
  }

  /**
   * Remove a team member via the admin endpoint (moderation).
   * Updates the local cache so the UI updates without re-fetching.
   */
  async function handleRemoveMember(teamId, memberId, userEmail) {
    if (!window.confirm(`Remove ${userEmail} from this team?`)) return

    setMessage('')
    setError('')
    try {
      await adminRemoveTeamMember(teamId, memberId)
      setMessage(`${userEmail} has been removed from the team.`)
      // Update the cached member list for this team
      setMembersMap(prev => ({
        ...prev,
        [teamId]: {
          ...prev[teamId],
          members: prev[teamId].members.filter(m => m.id !== memberId),
          total_members: prev[teamId].total_members - 1,
        }
      }))
      // Update the member_count in the teams list
      setTeams(prev => prev.map(t =>
        t.id === teamId ? { ...t, member_count: t.member_count - 1 } : t
      ))
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove member.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Page header */}
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold text-slate-900">Team Management</h1>
          <p className="mt-2 text-slate-500">
            View all teams on the platform and manage their members.
          </p>
        </div>

        {/* Status messages */}
        {message && (
          <div className="bg-green-50 text-green-700 px-5 py-3 rounded-2xl text-sm">
            {message}
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-700 px-5 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}

        {/* Teams list */}
        {loading && teams.length === 0 ? (
          // Loading skeleton
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl bg-white p-6 shadow-sm animate-pulse">
                <div className="h-5 bg-slate-200 rounded w-1/3 mb-2" />
                <div className="h-4 bg-slate-100 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-3xl bg-white p-12 shadow-sm text-center text-slate-500">
            No teams found on the platform.
          </div>
        ) : (
          <div className="space-y-3">
            {teams.map(team => (
              <div key={team.id} className="rounded-2xl bg-white shadow-sm overflow-hidden">

                {/* Team summary row */}
                <div className="flex items-center justify-between px-6 py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold text-slate-900">{team.name}</h3>
                      {/* Member count badge */}
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                        {team.member_count} member{team.member_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Owner: <span className="font-medium text-slate-700">{team.owner_email}</span>
                      <span className="mx-2 text-slate-300">·</span>
                      Created: {new Date(team.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Expand/collapse button */}
                  <button
                    onClick={() => toggleMembers(team.id)}
                    className="text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-4 py-2 transition-colors hover:bg-slate-50"
                  >
                    {expandedTeamId === team.id ? 'Hide members ↑' : 'View members ↓'}
                  </button>
                </div>

                {/* Expanded member list */}
                {expandedTeamId === team.id && (
                  <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
                    {memberLoading && !membersMap[team.id] ? (
                      <p className="text-slate-400 text-sm py-2">Loading members...</p>
                    ) : membersMap[team.id]?.members?.length === 0 ? (
                      <p className="text-slate-400 text-sm py-2">No members found.</p>
                    ) : (
                      <>
                        {/* Member table header */}
                        <div className="grid grid-cols-4 gap-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">
                          <span>Email</span>
                          <span>Role</span>
                          <span>Joined</span>
                          <span>Action</span>
                        </div>
                        {/* Member rows */}
                        <div className="space-y-1">
                          {membersMap[team.id]?.members?.map(member => (
                            <div
                              key={member.id}
                              className="grid grid-cols-4 gap-4 items-center bg-white rounded-xl px-3 py-2.5 text-sm"
                            >
                              {/* Email */}
                              <span className="text-slate-800 font-medium truncate">
                                {member.user_email}
                              </span>

                              {/* Role badge */}
                              <span className={`inline-flex w-fit items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                member.role === 'owner'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {member.role}
                              </span>

                              {/* Join date */}
                              <span className="text-slate-500">
                                {member.joined_at
                                  ? new Date(member.joined_at).toLocaleDateString()
                                  : '—'}
                              </span>

                              {/* Remove button (disabled for owners — can't remove the team owner) */}
                              {member.role !== 'owner' ? (
                                <button
                                  onClick={() => handleRemoveMember(team.id, member.id, member.user_email)}
                                  className="text-xs text-red-600 hover:text-red-800 hover:underline text-left"
                                >
                                  Remove
                                </button>
                              ) : (
                                <span className="text-xs text-slate-300 italic">Owner</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Load more button */}
        {hasMore && !loading && (
          <div className="text-center pt-2">
            <button
              onClick={() => loadTeams(page + 1)}
              className="rounded-xl border border-slate-200 px-6 py-2.5 text-slate-600 text-sm hover:bg-white transition-colors"
            >
              Load more teams
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
