import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { processCheckoutSession } from '../api'

export default function SuccessPage() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [processing, setProcessing] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (sessionId) {
      processCheckoutSession(sessionId)
        .then(() => {
          setProcessing(false)
        })
        .catch((err) => {
          const detail = err.response?.data?.detail || err.response?.data?.message || err.message
          setError(detail || 'Failed to process subscription. Please contact support.')
          setProcessing(false)
        })
    } else {
      setProcessing(false)
    }
  }, [sessionId])

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-8 shadow-sm text-center">
        <div className="mb-6">
          {processing ? (
            <div className="mx-auto h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="h-6 w-6 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : error ? (
            <div className="mx-auto h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          ) : (
            <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {processing ? 'Processing Payment...' : error ? 'Payment Error' : 'Payment Successful!'}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {processing
            ? 'Please wait while we activate your subscription.'
            : error
            ? error
            : 'Your subscription has been activated. You now have access to unlimited projects.'
          }
        </p>
        {!processing && (
          <div className="mt-8">
            <Link
              to="/app/dashboard"
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-700"
            >
              Go to Dashboard
            </Link>
          </div>
        )}
        {sessionId && (
          <p className="mt-4 text-xs text-slate-500">
            Session ID: {sessionId}
          </p>
        )}
      </div>
    </div>
  )
}