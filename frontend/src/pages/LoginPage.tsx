import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Code2, Shield, Zap, Users, LogIn, UserPlus, Sparkles } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { authApi } from '@/services/api'
import { Spinner } from '@/components/Spinner'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { isAuthenticated, isLoading, login, register, guestLogin } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectTarget = searchParams.get('redirect') || '/dashboard'

  // Form mode: 'login' | 'register'
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(redirectTarget, { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate, redirectTarget])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-editor-bg">
        <Spinner size="lg" />
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'register') {
        if (!name.trim()) {
          toast.error('Please enter your name')
          setSubmitting(false)
          return
        }
        await register({ name: name.trim(), email: email.trim(), password })
        toast.success('Account created successfully!')
      } else {
        await login({ email: email.trim(), password })
        toast.success('Welcome back!')
      }
      navigate(redirectTarget, { replace: true })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (mode === 'register' ? 'Registration failed' : 'Invalid email or password')
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGuestDemo() {
    setSubmitting(true)
    try {
      await guestLogin()
      toast.success('Logged in as Demo Developer!')
      navigate(redirectTarget, { replace: true })
    } catch {
      toast.error('Demo login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-editor-bg flex">
      {/* ── Left panel — branding ──────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-editor-sidebar border-r border-editor-border">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-brand/10">
            <Code2 className="h-5 w-5 text-brand" />
          </div>
          <span className="text-lg font-bold text-white">CodeCollab</span>
        </Link>

        {/* Centre content */}
        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Code together,<br />
            <span className="text-brand">ship faster.</span>
          </h1>
          <p className="text-gray-400 text-lg mb-10">
            Real-time collaborative coding with live cursors,
            instant execution, and version history.
          </p>

          {/* Feature checklist */}
          <ul className="space-y-4">
            {[
              { icon: Zap,    text: 'Conflict-free editing powered by Yjs CRDT' },
              { icon: Users,  text: 'Live cursors and real-time presence' },
              { icon: Shield, text: 'JWT authentication with secure password hashing' },
            ].map((item) => (
              <li key={item.text} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <item.icon className="h-4 w-4 text-brand" />
                </div>
                <span className="text-sm text-gray-300">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-600">
          B.Tech CSE Project — Mayank Saroha &amp; Reshav Govindam, 2026
        </p>
      </div>

      {/* ── Right panel — login / signup form ──────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        {/* Mobile logo */}
        <Link to="/" className="flex items-center gap-2 mb-8 lg:hidden">
          <Code2 className="h-7 w-7 text-brand" />
          <span className="text-xl font-bold text-white">CodeCollab</span>
        </Link>

        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white">
              {mode === 'register' ? 'Create an account' : 'Welcome back'}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {mode === 'register'
                ? 'Sign up to start collaborating on code'
                : 'Sign in to access your rooms'}
            </p>
          </div>

          {/* Quick Demo Access Button */}
          <button
            type="button"
            onClick={handleGuestDemo}
            disabled={submitting}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 mb-5
                       bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40
                       rounded-lg text-emerald-300 text-sm font-medium transition-colors"
          >
            <Sparkles className="h-4 w-4 text-emerald-400" />
            Quick Demo Login (1-Click Guest)
          </button>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alice Developer"
                  className="input text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alice@example.com"
                className="input text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full justify-center py-2.5 mt-2 text-sm"
            >
              {submitting ? (
                <Spinner size="sm" />
              ) : mode === 'register' ? (
                <>
                  <UserPlus className="h-4 w-4" /> Create Account
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" /> Sign In
                </>
              )}
            </button>
          </form>

          {/* Mode Switcher */}
          <div className="text-center mt-4 text-sm text-gray-400">
            {mode === 'register' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-brand hover:underline font-medium"
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="text-brand hover:underline font-medium"
                >
                  Create one
                </button>
              </>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-editor-border" />
            <span className="text-xs text-gray-600">or continue with</span>
            <div className="flex-1 h-px bg-editor-border" />
          </div>

          {/* GitHub OAuth button */}
          <a
            href={authApi.githubLoginUrl()}
            className="flex items-center justify-center gap-3 w-full px-4 py-2.5
                       bg-[#24292f] hover:bg-[#2f3439] border border-[#444c56]
                       rounded-lg text-white text-sm font-medium transition-colors"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57
                       0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41
                       -1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815
                       2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925
                       0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23
                       .96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65
                       .24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925
                       .435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57
                       A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            GitHub
          </a>

          <p className="text-center mt-6">
            <Link to="/" className="text-xs text-brand hover:text-brand-light transition-colors">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
