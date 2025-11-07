'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      // First, check if the email exists in the profiles table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('email')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle()

      console.log('Profile check:', { profileData, profileError })

      if (profileError) {
        console.error('Profile query error:', profileError)
        setError(`Database error: ${profileError.message}`)
        setLoading(false)
        return
      }

      if (!profileData) {
        setError('This email is not authorized. Please contact an administrator.')
        setLoading(false)
        return
      }

      // Email exists in profiles, send magic link
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      })

      if (signInError) {
        setError(signInError.message)
        setLoading(false)
        return
      }

      // Success - show message
      setSuccess('Check your email! We sent you a login link.')
      setLoading(false)
    } catch (err) {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-gray-900 via-purple-900 to-indigo-900">
      {/* Left side - Branding and Logo */}
      <div className="w-1/2 flex flex-col p-12">
        {/* VARYS AI Branding - Top Left */}
        <div className="mb-16">
          <h1 className="text-3xl font-bold text-white tracking-wider">
            VARYS AI
          </h1>
        </div>

        {/* Logo - Centered */}
        <div className="flex-1 flex items-center justify-center">
          <div className="relative">
            <Image
              src="/logo.png"
              alt="Varys AI Logo"
              width={600}
              height={600}
              className="w-full h-auto opacity-90"
              priority
            />
          </div>
        </div>
      </div>

      {/* Right side - Welcome and Login Card with Glassy White Background */}
      <div className="w-1/2 flex items-center justify-center p-12 bg-white/10 backdrop-blur-md">
        <div className="w-full max-w-md">
          {/* Welcome Title and Subheading */}
          <div className="mb-8">
            <h2 className="text-5xl font-bold text-white mb-4">
              Welcome
            </h2>
            <p className="text-xl text-gray-200">
              Log in with your authorized credentials.
            </p>
          </div>

          {/* Login Card */}
          <div className="bg-white/20 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/30">
            <form className="space-y-6" onSubmit={handleLogin}>
              <div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none relative block w-full px-4 py-3 bg-indigo-900/50 border border-indigo-500/30 placeholder-gray-400 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent sm:text-sm"
                  placeholder="Email address"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-900/30 border border-red-500/50 p-4">
                  <p className="text-sm font-medium text-red-200">
                    {error}
                  </p>
                </div>
              )}

              {success && (
                <div className="rounded-lg bg-green-900/30 border border-green-500/50 p-4">
                  <p className="text-sm font-medium text-green-200">
                    ✓ {success}
                  </p>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  {loading ? 'Checking...' : 'Send Login Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
