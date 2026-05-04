import React from 'react'
import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-6">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Subscription SaaS for project teams
            </h1>
            <p className="text-lg text-slate-600">
              Manage projects, monitor subscription status, and access admin controls with role-based access.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/register"
                className="inline-flex items-center justify-center rounded-md bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-700"
              >
                Start Free
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-md border border-slate-300 px-6 py-3 text-base font-semibold text-slate-900 hover:bg-slate-100"
              >
                Login
              </Link>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-900">User panel and admin panel</h2>
            <p className="mt-4 text-slate-600">
              The user panel lets customers manage projects and subscriptions. The admin panel lets site operators monitor users and subscription status.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
