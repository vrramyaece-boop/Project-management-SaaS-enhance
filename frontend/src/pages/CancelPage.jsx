import React from 'react'
import { Link } from 'react-router-dom'

export default function CancelPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-8 shadow-sm text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Subscription Cancelled</h1>
        <p className="mt-4 text-sm text-slate-600">
          Your checkout was cancelled. You can return to the app and try again when you're ready.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/app/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-700"
          >
            Go to Dashboard
          </Link>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-6 py-3 text-base font-semibold text-slate-900 hover:bg-slate-100"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
