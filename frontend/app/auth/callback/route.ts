import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  console.log('=== Auth Callback Started ===')
  console.log('Origin:', origin)
  console.log('Code exists:', !!code)

  if (code) {
    try {
      const supabase = await createClient()

      // Step 1: Exchange code for session
      // The PKCE verifier is automatically retrieved from cookies by the server client
      const { error: exchangeError, data } = await supabase.auth.exchangeCodeForSession(code)

      console.log('Step 1 - Exchange Code:')
      console.log('  Error:', exchangeError?.message)
      console.log('  User ID:', data?.user?.id)
      console.log('  User Email:', data?.user?.email)

      if (exchangeError) {
        console.error('Exchange code failed:', exchangeError)
        return NextResponse.redirect(`${origin}/login?error=auth_failed`)
      }

      if (!data.user) {
        console.error('No user data returned from exchange')
        return NextResponse.redirect(`${origin}/login?error=auth_failed`)
      }

      // Step 2: Check profiles table for authorization
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('id', data.user.id)
        .maybeSingle()

      console.log('Step 2 - Profile Lookup:')
      console.log('  User ID searched:', data.user.id)
      console.log('  Profile error:', profileError?.message)
      console.log('  Profile data:', profileData)

      if (profileError) {
        console.error('Profile query error:', profileError)
        return NextResponse.redirect(`${origin}/login?error=not_authorized`)
      }

      if (!profileData) {
        console.error('User not found in profiles table')
        return NextResponse.redirect(`${origin}/login?error=not_authorized`)
      }

      console.log('Step 3 - Authorization Success')
      console.log('  User role:', profileData.role)
      console.log('  Redirecting to dashboard')

      // Successful authentication and authorization
      return NextResponse.redirect(`${origin}/dashboard`)
    } catch (err) {
      console.error('Unexpected error in auth callback:', err)
      return NextResponse.redirect(`${origin}/login?error=auth_failed`)
    }
  }

  // If there's no code, redirect to login with error
  console.log('No code parameter provided')
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}


