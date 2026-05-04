import React, { useEffect, useState } from 'react'
import { getUsers } from '../api'

export default function AdminUsersPage() {
  const [users, setUsers] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadUsers() {
      try {
        const response = await getUsers(page, pageSize)
        setUsers(response.data)
        setHasMore(response.data.length === pageSize)
      } catch (err) {
        setError('Unable to load users.')
      } finally {
        setLoading(false)
      }
    }

    loadUsers()
  }, [page, pageSize])

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold text-slate-900">All users</h1>
          <p className="mt-2 text-slate-600">Review the registered users in the application.</p>
        </div>
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          {error && <p className="text-rose-700">{error}</p>}
          {loading ? (
            <p className="text-slate-600">Loading users…</p>
          ) : (
            <>
              <div className="space-y-4">
                {users.map((user) => (
                  <div key={user.id} className="rounded-3xl border border-slate-200 p-5">
                    <p className="font-semibold text-slate-900">{user.email}</p>
                    <p className="text-slate-600">Role: {user.role}</p>
                    <p className="text-slate-600">Status: {user.is_active ? 'Active' : 'Inactive'}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between gap-4">
                <button
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={page === 1}
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Previous
                </button>
                <p className="text-sm text-slate-600">Page {page}</p>
                <button
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={!hasMore}
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
