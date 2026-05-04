import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 text-center shadow-sm">
        <h1 className="text-4xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-4 text-slate-600">The page you are looking for does not exist.</p>
        <Link to="/" className="mt-8 inline-flex rounded-xl bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-700">
          Return home
        </Link>
      </div>
    </div>
  )
}
