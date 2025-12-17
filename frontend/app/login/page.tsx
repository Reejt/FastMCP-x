'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Suspense } from 'react'

// Dynamically import the animated background to avoid SSR issues
const AnoAI = dynamic(() => import('@/app/components/UI/animated-shader-background'), { ssr: false })

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [typedText, setTypedText] = useState('')
  const supabase = createClient()

  const textToType = 'Own your AI.'

  useEffect(() => {
    // Check for error from auth callback
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')

    if (errorParam === 'not_authorized') {
      setError('This email is not authorized. Please contact an administrator.')
    } else if (errorParam === 'auth_failed') {
      setError('Authentication failed. Please try again.')
    }
  }, [])

  useEffect(() => {
    let currentIndex = 0
    const typingInterval = setInterval(() => {
      if (currentIndex <= textToType.length) {
        setTypedText(textToType.substring(0, currentIndex))
        currentIndex++
      } else {
        clearInterval(typingInterval)
      }
    }, 100)

    return () => clearInterval(typingInterval)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      // Send magic link for authentication
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
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
    } catch {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding, Logo, and Text with Animated Background */}
      <div className="relative w-3/5 flex flex-col p-12 overflow-hidden">
        {/* Animated Shader Background - Only in left section */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <AnoAI />
        </div>

        {/* Left content with z-index above background */}
        <div className="relative z-10 flex flex-col h-full">
          {/* VARYS AI Branding and Logo - Top Left */}
          <div className="flex items-center gap-3 mb-16 ml-16">
            <Image
              src="/logo.png"
              alt="Varys AI Logo"
              width={40}
              height={40}
              className="opacity-90"
              priority
            />
            <h1 className="text-2xl font-bold text-white tracking-wider">
              VARYS AI
            </h1>
          </div>

          {/* Large Text - Left Aligned */}
          <div className="flex-1 flex flex-col justify-center ml-16 -mt-20">
            <h2 className="text-5xl font-bold text-white mb-6">
              Your AI, on your terms.
            </h2>
            <div className="text-5xl font-bold text-white">
              {typedText}<span className="animate-pulse">|</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Welcome and Login Card with Opaque Background */}
      <div className="w-2/5 flex items-center justify-center p-12 bg-gray-900">
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
            <Suspense fallback={null}>
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
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  )
}
