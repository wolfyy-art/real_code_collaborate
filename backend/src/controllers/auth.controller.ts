import { Request, Response } from 'express'
import axios from 'axios'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../database/prisma'
import { env } from '../config/env'
import { generateToken, setAuthCookie, clearAuthCookie } from '../middleware/auth'
import { createError } from '../middleware/errorHandler'

/**
 * auth.controller.ts — Authentication controller.
 * Supports:
 * 1. Email/Password Registration (with bcrypt hashing)
 * 2. Email/Password Login
 * 3. Guest / Demo Login (instant testing)
 * 4. GitHub OAuth 2.0 flow
 * 5. Current user retrieval (getMe)
 * 6. Logout
 */

// ── Validation schemas ──────────────────────────────────
export const registerSchema = z.object({
  name:     z.string().min(1, 'Name is required').max(100).trim(),
  email:    z.string().email('Valid email is required').toLowerCase().trim(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const loginSchema = z.object({
  email:    z.string().email('Valid email is required').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
})

// ── Register with email/password ────────────────────────
export async function register(req: Request, res: Response): Promise<void> {
  const { name, email, password } = req.body as z.infer<typeof registerSchema>

  // Check if email already in use
  const existing = await prisma.user.findUnique({
    where: { email },
  })
  if (existing) {
    throw createError('Email is already registered. Please log in.', 409)
  }

  // Hash password with bcrypt
  const saltRounds = 10
  const hashedPassword = await bcrypt.hash(password, saltRounds)

  // Generate an avatar placeholder if none provided
  const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`

  // Create user
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      avatarUrl,
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      githubId: true,
      createdAt: true,
    },
  })

  // Issue JWT and set cookie
  const token = generateToken(user.id)
  setAuthCookie(res, token)

  res.status(201).json({
    message: 'User registered successfully',
    token,
    user,
  })
}

// ── Login with email/password ───────────────────────────
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as z.infer<typeof loginSchema>

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
  })

  if (!user || !user.password) {
    throw createError('Invalid email or password.', 401)
  }

  // Verify password with bcrypt
  const isMatch = await bcrypt.compare(password, user.password)
  if (!isMatch) {
    throw createError('Invalid email or password.', 401)
  }

  // Issue JWT and set cookie
  const token = generateToken(user.id)
  setAuthCookie(res, token)

  res.json({
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      githubId: user.githubId,
    },
  })
}

// ── Demo / Guest Login (for immediate interactive testing)
export async function guestLogin(_req: Request, res: Response): Promise<void> {
  const guestSuffix = Math.floor(1000 + Math.random() * 9000)
  const guestName = `Guest Developer ${guestSuffix}`
  const guestEmail = `guest.${Date.now()}.${guestSuffix}@codecollab.dev`
  const defaultPassword = await bcrypt.hash('GuestDemoPass123!', 10)

  const user = await prisma.user.create({
    data: {
      name: guestName,
      email: guestEmail,
      password: defaultPassword,
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(guestName)}`,
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      githubId: true,
    },
  })

  const token = generateToken(user.id)
  setAuthCookie(res, token)

  res.json({
    message: 'Guest session started',
    token,
    user,
  })
}

// ── GitHub OAuth: Step 1 Redirect ───────────────────────
export function githubLogin(req: Request, res: Response): void {
  if (!env.GITHUB_CLIENT_ID) {
    res.status(503).json({
      error: 'GitHub OAuth is not configured.',
      instructions: [
        'Create a GitHub OAuth App at https://github.com/settings/developers',
        'Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your .env file',
        `Set callback URL to: ${env.GITHUB_CALLBACK_URL}`,
      ],
    })
    return
  }

  const params = new URLSearchParams({
    client_id:    env.GITHUB_CLIENT_ID,
    redirect_uri: env.GITHUB_CALLBACK_URL,
    scope:        'read:user user:email',
  })

  res.redirect(`https://github.com/login/oauth/authorize?${params}`)
}

// ── GitHub OAuth: Step 2 Callback ───────────────────────
export async function githubCallback(req: Request, res: Response): Promise<void> {
  const code = req.query.code as string | undefined

  if (!code) {
    res.redirect(`${env.FRONTEND_URL}/auth/callback?status=error&error=no_code`)
    return
  }

  try {
    const tokenRes = await axios.post<{ access_token: string; error?: string }>(
      'https://github.com/login/oauth/access_token',
      {
        client_id:     env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri:  env.GITHUB_CALLBACK_URL,
      },
      { headers: { Accept: 'application/json' } }
    )

    const accessToken = tokenRes.data.access_token
    if (!accessToken || tokenRes.data.error) {
      console.error('[Auth] GitHub token exchange failed:', tokenRes.data)
      res.redirect(`${env.FRONTEND_URL}/auth/callback?status=error&error=token_exchange_failed`)
      return
    }

    const [profileRes, emailsRes] = await Promise.all([
      axios.get<GithubProfile>('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      axios.get<GithubEmail[]>('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ])

    const profile = profileRes.data
    const emails  = emailsRes.data

    const primaryEmail =
      emails.find((e) => e.primary && e.verified)?.email ??
      emails.find((e) => e.verified)?.email ??
      null

    const user = await prisma.user.upsert({
      where: { githubId: String(profile.id) },
      update: {
        name:      profile.name ?? profile.login,
        email:     primaryEmail,
        avatarUrl: profile.avatar_url,
      },
      create: {
        githubId:  String(profile.id),
        name:      profile.name ?? profile.login,
        email:     primaryEmail,
        avatarUrl: profile.avatar_url,
      },
    })

    const jwt = generateToken(user.id)
    setAuthCookie(res, jwt)

    // Generate a secure, short-lived (60s) single-use exchange code to prevent leaking JWT in URL
    const exchangeCode = `oex_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
    oauthExchangeCodes.set(exchangeCode, {
      token: jwt,
      expiresAt: Date.now() + 60000,
    })

    res.redirect(`${env.FRONTEND_URL}/auth/callback?status=success&code=${exchangeCode}`)
  } catch (err) {
    console.error('[Auth] GitHub callback error:', err)
    res.redirect(`${env.FRONTEND_URL}/auth/callback?status=error&error=server_error`)
  }
}

// ── GET /auth/me ────────────────────────────────────────
export function getMe(req: Request, res: Response): void {
  res.json(req.authUser)
}

// ── POST /auth/logout ───────────────────────────────────
export function logout(req: Request, res: Response): void {
  clearAuthCookie(res)
  res.json({ message: 'Logged out successfully' })
}

// In-memory single-use exchange codes for OAuth token handoff (expires in 60s)
const oauthExchangeCodes = new Map<string, { token: string; expiresAt: number }>()

// Periodically clean expired codes
setInterval(() => {
  const now = Date.now()
  for (const [code, entry] of oauthExchangeCodes.entries()) {
    if (entry.expiresAt <= now) {
      oauthExchangeCodes.delete(code)
    }
  }
}, 30000)

/**
 * POST /auth/oauth-exchange
 * Exchanges a single-use exchange code for the actual JWT token.
 * Prevents exposing long-lived JWTs in URL query params or browser history.
 */
export function oauthExchange(req: Request, res: Response): void {
  const { code } = req.body as { code?: string }
  if (!code) {
    res.status(400).json({ error: 'Exchange code is required' })
    return
  }

  const entry = oauthExchangeCodes.get(code)
  if (!entry || entry.expiresAt <= Date.now()) {
    oauthExchangeCodes.delete(code)
    res.status(400).json({ error: 'Invalid or expired exchange code' })
    return
  }

  // Single-use: immediately delete upon redemption
  oauthExchangeCodes.delete(code)

  setAuthCookie(res, entry.token)
  res.json({ token: entry.token })
}
interface GithubProfile {
  id:         number
  login:      string
  name:       string | null
  avatar_url: string
}

interface GithubEmail {
  email:    string
  primary:  boolean
  verified: boolean
}
