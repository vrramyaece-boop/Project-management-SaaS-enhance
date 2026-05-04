import React, { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from './api'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('authToken'))
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('refreshToken'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    if (token) {
      api.setAuthToken(token)
      fetchCurrentUser()
      fetchUnreadCount()
    } else {
      setLoading(false)
    }
  }, [token])

  async function fetchCurrentUser() {
    try {
      const response = await api.getCurrentUser()
      setUser(response.data)
    } catch (error) {
      logout()
    } finally {
      setLoading(false)
    }
  }

  async function fetchUnreadCount() {
    try {
      const response = await api.getUnreadNotificationCount()
      setUnreadCount(response.data.unread_count || 0)
    } catch (error) {
      setUnreadCount(0)
    }
  }

  async function login(email, password) {
    const response = await api.login(email, password)
    const authToken = response.data.access_token
    const refresh = response.data.refresh_token
    api.setAuthToken(authToken)
    api.setRefreshToken(refresh)
    setToken(authToken)
    setRefreshToken(refresh)
    await fetchCurrentUser()
    navigate('/app/dashboard')
  }

  async function register(email, password) {
    const response = await api.register(email, password)
    return response.data
  }

  function logout() {
    api.clearAuthToken()
    api.clearRefreshToken()
    setToken(null)
    setRefreshToken(null)
    setUser(null)
    setUnreadCount(0)
    navigate('/login')
  }

  const value = {
    token,
    refreshToken,
    user,
    loading,
    unreadCount,
    login,
    register,
    logout,
    fetchUnreadCount,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
