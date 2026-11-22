import 'dotenv/config'
import http from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { Server as SocketIOServer } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'

import { env } from './config/env'
import { pubClient, subClient, connectRedis } from './config/redis'
import { prisma } from './database/prisma'
import { registerSocketHandlers } from './sockets/socketHandler'
import { getActiveRoomIds, getDocContent } from './collaboration/docManager'
import { notFound, errorHandler } from './middleware/errorHandler'

import authRoutes  from './routes/auth.routes'
import roomsRoutes from './routes/rooms.routes'

/**
 * index.ts — Application entry point.
 *
 * This file:
 *  1. Creates the Express app and configures middleware
 *  2. Mounts all API routes
 *  3. Creates the HTTP server (needed to share it with Socket.IO)
 *  4. Configures Socket.IO with the Redis adapter for horizontal scaling
 *  5. Starts listening
 */

async function bootstrap(): Promise<void> {
  // ── Express app ────────────────────────────────────────
  const app = express()

  // Security headers (helmet sets safe HTTP headers)
  app.use(helmet({
    crossOriginEmbedderPolicy: false, // allow Monaco Editor to load workers
  }))

  // CORS — allow requests from the frontend origin only
  app.use(cors({
    origin:      env.ALLOWED_ORIGINS,
    credentials: true,  // required for cookies
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }))

  // Parse JSON request bodies
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))

  // Parse cookies (needed to read the JWT HttpOnly cookie)
  app.use(cookieParser(env.COOKIE_SECRET))

  // Request logging — shows method, URL, status, response time
  app.use(morgan(env.IS_DEV ? 'dev' : 'combined'))

  // Rate limiting — prevents abuse (100 requests per 15 minutes per IP)
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      100,
    message:  { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders:   false,
  })
  app.use('/api/', limiter)

  // ── Root + Health ──────────────────────────────────────
  // Root route: helpful info when someone opens :4000 in a browser
  app.get('/', (_req, res) => {
    res.json({
      service: 'CodeCollab Backend API',
      status:  'running',
      version: '1.0.0',
      note:    'Open http://localhost:5173 for the application UI',
      endpoints: {
        health:   'GET  /health',
        login:    'GET  /auth/github',
        me:       'GET  /auth/me',
        logout:   'POST /auth/logout',
        rooms:    'GET  /api/rooms',
      },
    })
  })

  app.get('/health', (_req, res) => {
    res.json({
      status:  'ok',
      service: 'collab-editor-backend',
      time:    new Date().toISOString(),
    })
  })

  // ── Routes ─────────────────────────────────────────────
  // Auth routes mounted at /auth and /api/auth
  app.use('/auth', authRoutes)
  app.use('/api/auth', authRoutes)

  // Room + code + version routes: /api/rooms/...
  app.use('/api/rooms', roomsRoutes)

  // ── 404 and error handlers (must be last) ─────────────
  app.use(notFound)
  app.use(errorHandler)

  // ── HTTP server (shared with Socket.IO) ───────────────
  const httpServer = http.createServer(app)

  // ── Socket.IO ─────────────────────────────────────────
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin:      env.ALLOWED_ORIGINS,
      credentials: true,
    },
    // Allow large Yjs updates (up to 5MB)
    maxHttpBufferSize: 5 * 1024 * 1024,
  })

  // ── Redis adapter for horizontal scaling ──────────────
  // This allows multiple backend instances to share Socket.IO events.
  // If Redis is unavailable, we still start (single-instance mode).
  try {
    await connectRedis()
    io.adapter(createAdapter(pubClient, subClient))
    console.log('[Server] Socket.IO Redis adapter enabled')
  } catch {
    console.log('[Server] Redis not available — running in single-instance mode (OK for development)')
  }

  // Register all Socket.IO event handlers
  registerSocketHandlers(io)

  // ── Periodic auto-save: persist in-memory Y.Doc code to PostgreSQL ──
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const autoSaveInterval = setInterval(async () => {
    const roomIds = getActiveRoomIds()
    for (const roomId of roomIds) {
      try {
        const currentCode = getDocContent(roomId)
        if (currentCode !== undefined) {
          await prisma.room.update({
            where: { id: roomId },
            data: { currentCode, updatedAt: new Date() },
          })
        }
      } catch {
        // Room may have been deleted or database busy
      }
    }
  }, env.SNAPSHOT_INTERVAL_MS)

  // ── Start listening on 0.0.0.0 for public cloud hosting ─────
  httpServer.listen(env.PORT, '0.0.0.0', () => {
    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  CodeCollab Backend  ✓  Running')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  Host:        0.0.0.0:${env.PORT}`)
    console.log(`  Environment: ${env.NODE_ENV}`)
    console.log(`  Health:      /health`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
  })

  // ── Graceful shutdown ──────────────────────────────────
  // Cleanly close DB and Redis connections on Ctrl+C
  process.on('SIGTERM', () => gracefulShutdown(httpServer))
  process.on('SIGINT',  () => gracefulShutdown(httpServer))
}

async function gracefulShutdown(server: http.Server): Promise<void> {
  console.log('\n[Server] Shutting down gracefully...')
  server.close(async () => {
    await prisma.$disconnect()
    pubClient.disconnect()
    subClient.disconnect()
    console.log('[Server] Shutdown complete.')
    process.exit(0)
  })
}

// Start the server
bootstrap().catch((err) => {
  console.error('[Server] Fatal startup error:', err)
  process.exit(1)
})
