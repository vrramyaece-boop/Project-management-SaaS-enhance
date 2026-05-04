import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export default function RegisterPage() {
  const { register } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [verificationToken, setVerificationToken] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccessMessage('')
    setVerificationToken('')
    setIsSubmitting(true)

    try {
      const response = await register(email, password)
      setVerificationToken(response.verification_token)
      setSuccessMessage('Account created. Verify your email with the token below.')
      setEmail('')
      setPassword('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Create account</h1>
        <p className="mt-2 text-sm text-slate-600">Register to manage your projects and subscription.</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {successMessage && (
            <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          )}
          {verificationToken && (
            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              Verification token: <code className="font-mono text-slate-900">{verificationToken}</code>
              <p className="mt-2">
                Paste this token on the <Link to="/verify-email" className="font-semibold text-slate-900 hover:underline">verify email</Link> page.
              </p>
            </div>
          )}
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
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-slate-900 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
