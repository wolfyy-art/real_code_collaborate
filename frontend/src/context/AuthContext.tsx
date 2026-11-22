import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import { authApi } from '@/services/api'

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export interface User {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  githubId: string | null
}

interface AuthContextValue {
  user: User | null
  isLoading: boolean          // true while we check session on page load
  isAuthenticated: boolean
  login: (data: { email: string; password: string }) => Promise<void>
  register: (data: { name: string; email: string; password: string }) => Promise<void>
  guestLogin: () => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

// -------------------------------------------------------
// Context creation
// -------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null)

// -------------------------------------------------------
// Provider
// -------------------------------------------------------

/**
 * AuthProvider wraps the entire app in App.tsx.
 * On mount it calls GET /api/auth/me to check if there's an active session.
 * It stores the user object and exposes it to all child components.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true) // start true — checking session

  // Fetch current user from backend
  const refreshUser = useCallback(async () => {
    try {
      const data = await authApi.me()
      setUser(data)
    } catch {
      // Not authenticated — clear user
      setUser(null)
    }
  }, [])

  // Check session when app first loads
  useEffect(() => {
    refreshUser().finally(() => setIsLoading(false))
  }, [refreshUser])

  // Log in with email/password
  const login = useCallback(async (data: { email: string; password: string }) => {
    const res = await authApi.login(data)
    if (res.token) {
      localStorage.setItem('auth_token', res.token)
    }
    setUser(res.user)
  }, [])

  // Register with email/password
  const register = useCallback(async (data: { name: string; email: string; password: string }) => {
    const res = await authApi.register(data)
    if (res.token) {
      localStorage.setItem('auth_token', res.token)
    }
    setUser(res.user)
  }, [])

  // Quick guest login
  const guestLogin = useCallback(async () => {
    const res = await authApi.guestLogin()
    if (res.token) {
      localStorage.setItem('auth_token', res.token)
    }
    setUser(res.user)
  }, [])

  // Call backend logout endpoint then clear local state
  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      localStorage.removeItem('auth_token')
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        login,
        register,
        guestLogin,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// -------------------------------------------------------
// Hook — use this in any component to access auth state
// -------------------------------------------------------
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
