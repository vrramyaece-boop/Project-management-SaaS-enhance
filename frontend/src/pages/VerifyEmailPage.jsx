import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { verifyEmail } from '../api'

export default function VerifyEmailPage() {
  const [token, setToken] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleVerify(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSubmitting(true)

    try {
      await verifyEmail(token)
      setMessage('Email verified successfully. You may now log in.')
      setToken('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Verification failed. Check your token and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Verify your email</h1>
        <p className="mt-2 text-sm text-slate-600">Paste the verification token received after registration.</p>
        <form onSubmit={handleVerify} className="mt-8 space-y-6">
          {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {message && <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
          <label className="block text-sm font-medium text-slate-700">
            Verification token
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-slate-900 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Verifying…' : 'Verify email'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already verified?{' '}
          <Link to="/login" className="font-semibold text-slate-900 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
