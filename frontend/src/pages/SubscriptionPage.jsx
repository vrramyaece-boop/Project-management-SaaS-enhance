import React, { useEffect, useState } from 'react'
import { createCheckoutSession, getSubscription } from '../api'

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const response = await getSubscription()
        setSubscription(response.data)
      } catch (err) {
        setError('Unable to load subscription. Please refresh.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  async function handleUpgrade() {
    setError('')
    setSubmitting(true)
    try {
      const response = await createCheckoutSession()
      window.location.href = response.data.checkout_url
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to create checkout session.')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold text-slate-900">Subscription</h1>
          <p className="mt-2 text-slate-600">View billing status and manage your plan.</p>
        </div>
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          {loading ? (
            <p className="text-slate-600">Loading subscription…</p>
          ) : (
            <div className="space-y-4 text-slate-700">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Current plan</h2>
                <p className="mt-2">Plan: {subscription?.plan || 'free'}</p>
                <p>Status: {subscription?.status || 'active'}</p>
                <p>
                  Renewal: {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : 'Not available'}
                </p>
              </div>
              {subscription?.plan === 'free' ? (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                  <h3 className="text-lg font-semibold text-slate-900">Upgrade to Pro</h3>
                  <p className="mt-2 text-slate-600">
                    Unlock unlimited projects and remove the free plan project limit.
                  </p>
                  <button
                    onClick={handleUpgrade}
                    disabled={submitting}
                    className="mt-4 rounded-xl bg-slate-900 px-5 py-3 text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? 'Redirecting…' : 'Upgrade to Pro'}
                  </button>
                  {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
                </div>
              ) : (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                  <h3 className="text-lg font-semibold text-slate-900">You are on Pro</h3>
                  <p className="mt-2 text-slate-600">Thank you for being a subscriber. Manage billing from Stripe after checkout.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
