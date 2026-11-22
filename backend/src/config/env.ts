import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Load .env — check backend/ first, then fall back to project root.
// This supports both: running `npm run dev` from inside backend/
// and running via Docker Compose from the project root.
const localEnv = path.resolve(__dirname, '../../.env')   // backend/.env
const rootEnv  = path.resolve(__dirname, '../../../.env') // root .env

if (fs.existsSync(localEnv)) {
  dotenv.config({ path: localEnv })
} else {
  dotenv.config({ path: rootEnv })
}

/**
 * env.ts — Centralised environment variable access.
 *
 * All environment variables are read here.
 * The app throws immediately at startup if a required variable is missing.
 * This prevents silent failures in production.
 */

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
      `Copy .env.example to .env and fill in the value.`
    )
  }
  return value
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback
}

export const env = {
  // Server
  NODE_ENV:  optional('NODE_ENV', 'development'),
  PORT:      parseInt(optional('PORT', '4000'), 10),
  IS_PROD:   process.env.NODE_ENV === 'production',
  IS_DEV:    process.env.NODE_ENV !== 'production',

  // Frontend
  FRONTEND_URL: optional('FRONTEND_URL', 'http://localhost:5173'),

  // Database
  DATABASE_URL: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/collab_editor'),

  // Redis
  REDIS_URL: optional('REDIS_URL', 'redis://localhost:6379'),

  // JWT
  JWT_SECRET:     requireEnv('JWT_SECRET', 'dev-secret-change-in-production-must-be-long'),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '7d'),

  // GitHub OAuth
  GITHUB_CLIENT_ID:     optional('GITHUB_CLIENT_ID', ''),
  GITHUB_CLIENT_SECRET: optional('GITHUB_CLIENT_SECRET', ''),
  GITHUB_CALLBACK_URL:  optional(
    'GITHUB_CALLBACK_URL',
    optional('IS_PROD') || process.env.NODE_ENV === 'production'
      ? 'https://codecollab-api-2xar.onrender.com/auth/github/callback'
      : 'http://localhost:4000/auth/github/callback'
  ),

  // Judge0
  JUDGE0_API_URL:  optional('JUDGE0_API_URL', 'https://ce.judge0.com'),
  JUDGE0_API_KEY:  optional('JUDGE0_API_KEY', ''),
  JUDGE0_API_HOST: optional('JUDGE0_API_HOST', ''),

  // Cookie
  COOKIE_SECRET: requireEnv('COOKIE_SECRET', 'dev-cookie-secret-change-in-production'),
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',

  // CORS — combine ALLOWED_ORIGINS and FRONTEND_URL
  ALLOWED_ORIGINS: Array.from(
    new Set([
      ...optional('ALLOWED_ORIGINS', 'http://localhost:5173')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
      ...(optional('FRONTEND_URL') ? [optional('FRONTEND_URL').trim()] : []),
    ])
  ),

  // Snapshot interval in ms (default 30 seconds)
  SNAPSHOT_INTERVAL_MS: parseInt(optional('SNAPSHOT_INTERVAL_MS', '30000'), 10),
}
