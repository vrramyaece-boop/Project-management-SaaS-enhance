import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await login(email, password)
    } catch (err) {
      setError('Login failed. Please check your credentials.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">Use your account to access the dashboard.</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-slate-900 focus:outline-none"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-slate-900 focus:outline-none"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          New user?{' '}
          <Link to="/register" className="font-semibold text-slate-900 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
