import { Router } from 'express'
import {
  register,
  login,
  guestLogin,
  githubLogin,
  githubCallback,
  getMe,
  logout,
  oauthExchange,
  registerSchema,
  loginSchema,
} from '../controllers/auth.controller'
import { authenticate } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { asyncHandler } from '../middleware/errorHandler'

const router = Router()

/**
 * Auth routes — mounted at /auth and /api/auth in index.ts
 *
 * POST /auth/register         → register new user with name, email, password
 * POST /auth/login            → login user with email, password
 * POST /auth/guest            → quick guest login for testing/demo
 * GET  /auth/github           → redirect to GitHub OAuth
 * GET  /auth/github/callback  → GitHub redirects back here
 * GET  /auth/me               → get current user (requires authentication)
 * POST /auth/logout           → clear session cookie
 */

// User registration with email/password
router.post('/register', validate(registerSchema), asyncHandler(register))

// User login with email/password
router.post('/login', validate(loginSchema), asyncHandler(login))

// Guest / demo login
router.post('/guest', asyncHandler(guestLogin))
router.get('/guest', asyncHandler(guestLogin))

// Redirect to GitHub authorization page
router.get('/github', asyncHandler(githubLogin))

// GitHub sends the user back here after they approve
router.get('/github/callback', asyncHandler(githubCallback))

// Exchange temporary OAuth code for JWT token
router.post('/oauth-exchange', asyncHandler(oauthExchange))

// Get the currently logged-in user
router.get('/me', authenticate, asyncHandler(getMe))

// Log out — clears the HttpOnly cookie
router.post('/logout', asyncHandler(logout))

export default router
