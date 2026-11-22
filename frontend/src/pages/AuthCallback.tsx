import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Code2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { authApi } from '@/services/api'
import toast from 'react-hot-toast'

/**
 * AuthCallback — handles the redirect back from GitHub OAuth.
 *
 * Flow:
 * 1. GitHub redirects to backend: GET /auth/github/callback
 * 2. Backend validates the code, creates/updates the user, sets cookie
 * 3. Backend redirects browser to: /auth/callback?status=success&code=oex_...
 * 4. THIS page exchanges the one-time code for the token, stores it in localStorage,
 *    refreshes the user state, and navigates to the dashboard.
 */
export default function AuthCallback() {
  const [params] = useSearchParams()
  const navigate  = useNavigate()
  const { refreshUser } = useAuth()
  const called = useRef(false) // prevent double-execution in StrictMode

  const status = params.get('status')
  const error  = params.get('error')
  const code   = params.get('code')

  useEffect(() => {
    if (called.current) return
    called.current = true

    if (status === 'success') {
      const finishAuth = async () => {
        try {
          if (code) {
            // Exchange single-use temporary code for JWT token
            const exchangeRes = await authApi.oauthExchange(code)
            if (exchangeRes.token) {
              localStorage.setItem('auth_token', exchangeRes.token)
            }
          }
          await refreshUser()
          toast.success('Logged in successfully via GitHub!')
          navigate('/dashboard', { replace: true })
        } catch (err) {
          console.error('[AuthCallback] Token exchange error:', err)
          toast.error('Failed to complete GitHub authentication.')
          setTimeout(() => navigate('/login', { replace: true }), 2500)
        }
      }

      finishAuth()
    } else {
      // OAuth failed — go back to login with an error after 3 seconds
      const msg = error ? `GitHub sign-in error: ${error}` : 'GitHub authentication failed'
      toast.error(msg)
      setTimeout(() => navigate('/login', { replace: true }), 3000)
    }
  }, [status, error, code, refreshUser, navigate])

  return (
    <div className="min-h-screen bg-editor-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center px-4">
        <Code2 className="h-10 w-10 text-brand" />

        {status === 'success' || !status ? (
          <>
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-editor-border border-t-brand" />
            <p className="text-white font-medium">Completing sign in...</p>
            <p className="text-sm text-gray-400">You will be redirected automatically.</p>
          </>
        ) : (
          <>
            <p className="text-red-400 font-medium">Authentication failed</p>
            <p className="text-sm text-gray-400">
              {error || 'An error occurred during sign in.'}
            </p>
            <p className="text-xs text-gray-500">Redirecting to login...</p>
          </>
        )}
      </div>
    </div>
  )
}
