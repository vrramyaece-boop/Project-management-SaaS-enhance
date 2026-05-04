// frontend/src/pages/TeamsPage.jsx
// Team management page — create teams, invite members, respond to invitations.

import React, { useEffect, useState } from 'react'
import {
  getTeams, createTeam, inviteTeamMember,
  getMyInvitations, respondToInvitation, getTeamMembers
} from '../api'

export default function TeamsPage() {
  const [teams, setTeams] = useState([])
  const [invitations, setInvitations] = useState([])
  const [newTeamName, setNewTeamName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [activeTeamId, setActiveTeamId] = useState(null)
  const [expandedTeam, setExpandedTeam] = useState(null)
  const [teamMembers, setTeamMembers] = useState({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load teams and pending invitations on mount
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [teamsRes, invitesRes] = await Promise.all([
        getTeams().catch(() => ({ data: [] })),
        getMyInvitations().catch(() => ({ data: [] })),
      ])
      setTeams(teamsRes.data)
      setInvitations(invitesRes.data)
    } finally {
      setLoading(false)
    }
  }

  /** Create a new team and add it to the list. */
  async function handleCreateTeam(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      const res = await createTeam(newTeamName)
      setTeams(prev => [...prev, res.data])
      setNewTeamName('')
      setMessage(`Team "${res.data.name}" created successfully!`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create team')
    }
  }

  /** Invite a user by email to the selected team. */
  async function handleInvite(teamId) {
    setError('')
    setMessage('')
    try {
      await inviteTeamMember(teamId, inviteEmail)
      setMessage(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      setActiveTeamId(null)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send invitation')
    }
  }

  /** Accept or decline a team invitation then refresh the lists. */
  async function handleInvitationResponse(invitationId, action) {
    setError('')
    try {
      await respondToInvitation(invitationId, action)
      setMessage(`Invitation ${action}`)
      loadData() // reload teams and invitations
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to respond to invitation')
    }
  }

  /** Toggle member list for a team. */
  async function toggleTeamMembers(teamId) {
    if (expandedTeam === teamId) {
      setExpandedTeam(null)
      return
    }
    setExpandedTeam(teamId)
    if (!teamMembers[teamId]) {
      try {
        const res = await getTeamMembers(teamId)
        setTeamMembers(prev => ({ ...prev, [teamId]: res.data }))
      } catch {
        setError('Failed to load team members')
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">

        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold text-slate-900">My Teams</h1>
          <p className="mt-2 text-slate-500">Create teams and collaborate on projects with your team.</p>
        </div>

        {/* Status messages */}
        {message && <p className="bg-green-50 text-green-700 p-4 rounded-2xl">{message}</p>}
        {error && <p className="bg-red-50 text-red-700 p-4 rounded-2xl">{error}</p>}

        {/* Pending invitations */}
        {invitations.length > 0 && (
          <div className="rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Pending Invitations</h2>
            <div className="space-y-3">
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
                  <div>
                    <p className="font-medium text-slate-900">Team #{inv.team_id}</p>
                    <p className="text-sm text-slate-500">Invited by user #{inv.invited_by_id}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleInvitationResponse(inv.id, 'accepted')}
                      className="rounded-lg bg-green-600 px-4 py-2 text-white text-sm hover:bg-green-700"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleInvitationResponse(inv.id, 'declined')}
                      className="rounded-lg bg-slate-200 px-4 py-2 text-slate-700 text-sm hover:bg-slate-300"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create team form */}
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Create New Team</h2>
          <form onSubmit={handleCreateTeam} className="flex gap-3">
            <input
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              placeholder="Team name"
              required
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-6 py-3 text-white hover:bg-slate-700 font-medium"
            >
              Create
            </button>
          </form>
        </div>

        {/* Team list */}
        {loading ? (
          <p className="text-slate-400 text-center py-8">Loading teams...</p>
        ) : teams.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 shadow-sm text-center text-slate-500">
            No teams yet. Create one above to start collaborating.
          </div>
        ) : (
          teams.map(team => (
            <div key={team.id} className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{team.name}</h3>
                  <p className="text-sm text-slate-500">Team ID: {team.id}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleTeamMembers(team.id)}
                    className="text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-1"
                  >
                    {expandedTeam === team.id ? 'Hide' : 'Members'}
                  </button>
                  <button
                    onClick={() => setActiveTeamId(activeTeamId === team.id ? null : team.id)}
                    className="text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-3 py-1"
                  >
                    + Invite
                  </button>
                </div>
              </div>

              {/* Member list */}
              {expandedTeam === team.id && teamMembers[team.id] && (
                <div className="mt-4 space-y-2">
                  {teamMembers[team.id].map(member => (
                    <div key={member.id} className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                      <span>User #{member.user_id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${member.role === 'owner' ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-600'}`}>{member.role}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Invite form */}
              {activeTeamId === team.id && (
                <div className="flex gap-3 mt-4">
                  <input
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="Enter email to invite"
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    onClick={() => handleInvite(team.id)}
                    className="rounded-xl bg-blue-600 px-5 py-2 text-white text-sm hover:bg-blue-700"
                  >
                    Send Invite
                  </button>
                  <button
                    onClick={() => setActiveTeamId(null)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-slate-600 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
