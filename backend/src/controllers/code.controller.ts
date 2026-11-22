import { Request, Response } from 'express'
import { z } from 'zod'
import axios from 'axios'
import { prisma } from '../database/prisma'
import { env } from '../config/env'
import { createError } from '../middleware/errorHandler'

// ── Language ID mapping for Judge0 API ────────────────
const JUDGE0_LANGUAGE_IDS: Record<string, number> = {
  python:     71, // Python (3.8.1)
  javascript: 63, // JavaScript (Node.js 12.14.0)
  java:       62, // Java (OpenJDK 13.0.1)
}

// ── Validation schema ──────────────────────────────────
export const executeCodeSchema = z.object({
  code:     z.string().max(65536, 'Code must be under 64KB'),
  language: z.enum(['python', 'javascript', 'java']),
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Judge0Submission { token: string }
interface Judge0Result {
  stdout:         string | null
  stderr:         string | null
  compile_output: string | null
  message:        string | null
  status:         { id: number; description: string }
  time:           string | null
  memory:         number | null
}

/**
 * POST /api/rooms/:roomId/execute
 * Submits code to Judge0 for real sandboxed execution.
 * When Judge0 credentials are required but missing or execution fails,
 * returns a descriptive error rather than silent mock execution.
 */
export async function executeCode(req: Request, res: Response): Promise<void> {
  const { roomId } = req.params
  const { code, language } = req.body as z.infer<typeof executeCodeSchema>
  const userId = req.authUser!.id

  // Verify user is a member of the room
  const membership = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  })
  if (!membership) throw createError('You are not a member of this room', 403)

  // Determine if using RapidAPI host or self-hosted / direct Judge0 URL
  const isRapidApi = Boolean(
    env.JUDGE0_API_HOST ||
    env.JUDGE0_API_URL.includes('rapidapi.com')
  )

  // Validate credentials when using a provider that requires an API key
  if (isRapidApi && !env.JUDGE0_API_KEY) {
    throw createError(
      'Judge0 API key is not configured on the server. Please set JUDGE0_API_KEY and JUDGE0_API_HOST in backend environment variables.',
      503
    )
  }

  const languageId = JUDGE0_LANGUAGE_IDS[language]
  if (!languageId) {
    throw createError(`Language '${language}' is not supported for execution`, 400)
  }

  // Submit to Judge0
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (isRapidApi) {
    headers['X-RapidAPI-Host'] = env.JUDGE0_API_HOST || 'judge0-ce.p.rapidapi.com'
    headers['X-RapidAPI-Key'] = env.JUDGE0_API_KEY
  } else if (env.JUDGE0_API_KEY) {
    headers['X-Auth-Token'] = env.JUDGE0_API_KEY
  }

  try {
    // Attempt wait=true first for fast execution (< 2 seconds)
    const fastUrl = `${env.JUDGE0_API_URL}/submissions?base64_encoded=false&wait=true`
    const fastRes = await axios.post<Judge0Result & { token?: string }>(
      fastUrl,
      {
        language_id: languageId,
        source_code: code,
        cpu_time_limit: 5,
        memory_limit: 128000,
      },
      {
        headers,
        timeout: 10000,
      }
    )

    if (fastRes.data.status && fastRes.data.status.id >= 3) {
      res.json({
        mock: false,
        stdout: fastRes.data.stdout,
        stderr: fastRes.data.stderr,
        compile_output: fastRes.data.compile_output,
        message: fastRes.data.message,
        status: fastRes.data.status,
        time: fastRes.data.time,
        memory: fastRes.data.memory,
      })
      return
    }

    // If wait=true returned queued/processing token or token only, poll for it
    const token = fastRes.data.token
    if (token) {
      const polledResult = await pollJudge0(token, headers)
      res.json({ mock: false, ...polledResult })
      return
    }

    throw createError('Failed to obtain submission status from Judge0', 502)
  } catch (err: unknown) {
    console.error('[Judge0] Execution request error:', err)
    const axiosError = err as { response?: { status?: number; data?: { message?: string; error?: string } } }
    if (axiosError.response?.data?.message || axiosError.response?.data?.error) {
      const msg = axiosError.response.data.message || axiosError.response.data.error
      throw createError(`Judge0 API error: ${msg}`, axiosError.response.status || 502)
    }
    throw createError('Failed to execute code on Judge0. Please check server logs and configuration.', 502)
  }
}

async function pollJudge0(token: string, headers: Record<string, string>, attempts = 15): Promise<Judge0Result> {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    const res = await axios.get<Judge0Result>(
      `${env.JUDGE0_API_URL}/submissions/${token}?base64_encoded=false`,
      {
        headers,
        timeout: 5000,
      }
    )
    if (res.data.status && res.data.status.id >= 3) {
      return res.data
    }
  }
  throw createError('Code execution timed out waiting for Judge0 results', 408)
}
