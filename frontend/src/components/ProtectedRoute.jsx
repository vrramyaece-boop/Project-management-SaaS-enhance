import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export default function ProtectedRoute({ children, role }) {
  const { token, user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-700">Loading...</div>
      </div>
    )
  }

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (role && user?.role !== role) {
    return <Navigate to={user?.role === 'admin' ? '/admin/dashboard' : '/app/dashboard'} replace />
  }

  return children
}
