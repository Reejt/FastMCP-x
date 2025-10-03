'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function DashboardPage() {
  const router = useRouter()
  // Demo user data
  const [user] = useState({
    email: 'demo@example.com',
    role: 'user'
  })

  const handleSignOut = () => {
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Varys AI</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">{user.email}</span>
              {user.role === 'admin' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  Admin
                </span>
              )}
              <button
                onClick={handleSignOut}
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 rounded-lg h-96 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Welcome to Varys AI
              </h2>
              <p className="text-gray-600">
                You're logged in as: <span className="font-medium">{user.role}</span>
              </p>
              <p className="text-sm text-gray-500 mt-4">
                (Demo mode - Supabase not connected yet)
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
