import { Server as SocketIOServer, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { prisma } from '../database/prisma'
import { env } from '../config/env'
import {
  getOrCreateDoc,
  applyUpdate,
  getStateAsUpdate,
  getDiffUpdate,
} from '../collaboration/docManager'

/**
 * socketHandler.ts — Real-time collaboration over Socket.IO.
 *
 * Events handled:
 *
 *  Client → Server:
 *    join-room          user wants to join a room
 *    sync-step1         client sends its state vector; server replies with missing updates
 *    sync-update        client sends a Yjs document update (keystroke, edit, etc.)
 *    awareness-update   client sends cursor position / presence data (binary or json)
 *    leave-room         user explicitly leaves
 *
 *  Server → Client:
 *    sync-full-state    server sends the full Yjs document state as binary update
 *    sync-step2         server sends the updates the client is missing
 *    sync-update        broadcast a Yjs update to all other room members
 *    awareness-update   broadcast cursor/presence to other room members
 *    room-users         current list of online users in the room
 *    user-left          user left room
 *    error              something went wrong
 */

interface SocketUser {
  id:        string
  name:      string
  avatarUrl: string | null
}

interface AwarenessState {
  user:   SocketUser
  cursor: unknown  // Yjs awareness can carry any JSON-serialisable data
}

// Track which users are in which rooms: roomId → Map of socketId → AwarenessState
const roomUsers = new Map<string, Map<string, AwarenessState>>()

export function registerSocketHandlers(io: SocketIOServer): void {

  // ── Authentication middleware for Socket.IO ──────────────
  // Runs before every connection is established.
  // Reads the JWT from cookie, auth payload, or Authorization header.
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie ?? ''
      const cookieToken = parseCookieToken(cookieHeader)
      const authToken = socket.handshake.auth?.token as string | undefined
      const headerToken = socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '')

      const token = cookieToken || authToken || headerToken

      if (!token) {
        return next(new Error('Not authenticated'))
      }

      let payload: { userId: string }
      try {
        payload = jwt.verify(token, env.JWT_SECRET) as { userId: string }
      } catch {
        return next(new Error('Invalid token'))
      }

      const user = await prisma.user.findUnique({
        where:  { id: payload.userId },
        select: { id: true, name: true, avatarUrl: true },
      })

      if (!user) {
        return next(new Error('User not found'))
      }

      // Attach user to socket for use in handlers below
      // eslint-disable-next-line no-extra-semi
      ;(socket as SocketWithUser).user = user
      next()
    } catch {
      next(new Error('Authentication error'))
    }
  })

  // ── Connection handler ───────────────────────────────────
  io.on('connection', (socket: Socket) => {
    const user = (socket as SocketWithUser).user
    console.log(`[Socket] Connected: ${user.name} (${socket.id})`)

    // ── JOIN ROOM ──────────────────────────────────────────
    socket.on('join-room', async (roomId: string) => {
      try {
        // If this socket is already in a different room, leave it first.
        // This handles reconnects and room switches without leaving ghost users.
        const previousRoomId = (socket as SocketWithUser).currentRoomId
        if (previousRoomId && previousRoomId !== roomId) {
          handleLeaveRoom(io, socket, previousRoomId, user)
        }

        // Auto-join room membership if not already a member (supports direct link sharing)
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          select: { id: true, currentCode: true },
        })
        if (!room) {
          socket.emit('error', { message: 'Room not found' })
          return
        }

        // Ensure user is enrolled in roomMember table
        await prisma.roomMember.upsert({
          where:  { roomId_userId: { roomId, userId: user.id } },
          update: {},
          create: { roomId, userId: user.id, role: 'member' },
        })

        // Initialize server Y.Doc with saved currentCode if doc is newly created.
        // If the doc already exists in memory (reconnect), this is a no-op.
        getOrCreateDoc(roomId, room.currentCode ?? '')

        // Join the Socket.IO room (isolated namespace for broadcasts)
        socket.join(roomId)
        console.log(`[Socket] ${user.name} joined room ${roomId}`)

        // Register user presence in the room
        if (!roomUsers.has(roomId)) {
          roomUsers.set(roomId, new Map())
        }
        roomUsers.get(roomId)!.set(socket.id, {
          user,
          cursor: null,
        })

        // Store current roomId on socket for cleanup on disconnect
        ;(socket as SocketWithUser).currentRoomId = roomId

        // Broadcast updated user list to everyone in the room
        broadcastRoomUsers(io, roomId)

        // Send the current full document state to the joining user.
        // This is the authoritative server state — the client applies it
        // and only seeds initialCode if this update is empty (new room).
        const fullState = getStateAsUpdate(roomId)
        socket.emit('sync-full-state', Array.from(fullState))

      } catch (err) {
        console.error('[Socket] join-room error:', err)
        socket.emit('error', { message: 'Failed to join room' })
      }
    })

    // ── SYNC STEP 1 — client sends its state vector ────────
    // Client tells server what it already has.
    // Server replies with only the updates the client is missing.
    socket.on('sync-step1', (data: { roomId: string; stateVector: number[] }) => {
      try {
        const { roomId, stateVector } = data
        const clientSV = new Uint8Array(stateVector)
        const missingUpdates = getDiffUpdate(roomId, clientSV)
        socket.emit('sync-step2', Array.from(missingUpdates))
      } catch (err) {
        console.error('[Socket] sync-step1 error:', err)
      }
    })

    // ── SYNC UPDATE — client sends an incremental Yjs update ──
    // This happens on every edit. We:
    //  1. Apply it to the server's Y.Doc (source of truth)
    //  2. Broadcast it to all OTHER users in the room
    socket.on('sync-update', (data: { roomId: string; update: number[] }) => {
      try {
        const { roomId, update } = data
        const updateBytes = new Uint8Array(update)

        // Apply to server doc
        applyUpdate(roomId, updateBytes)

        // Forward to all OTHER sockets in this room (not back to sender)
        socket.to(roomId).emit('sync-update', Array.from(updateBytes))
      } catch (err) {
        console.error('[Socket] sync-update error:', err)
      }
    })

    // ── AWARENESS UPDATE — cursor position and user presence ──
    // Awareness carries ephemeral data: cursor position, selection, user name & color.
    // Can receive either binary update or state object.
    socket.on('awareness-update', (data: { roomId: string; update?: number[]; state?: AwarenessState }) => {
      try {
        const { roomId, update, state } = data

        if (state) {
          // Update local tracking
          const users = roomUsers.get(roomId)
          if (users?.has(socket.id)) {
            users.set(socket.id, state)
          }
        }

        // Broadcast to others — include socketId
        socket.to(roomId).emit('awareness-update', {
          socketId: socket.id,
          update,
          state,
        })
      } catch (err) {
        console.error('[Socket] awareness-update error:', err)
      }
    })

    // ── LEAVE ROOM ─────────────────────────────────────────
    socket.on('leave-room', (roomId: string) => {
      handleLeaveRoom(io, socket, roomId, user)
    })

    // ── DISCONNECT ─────────────────────────────────────────
    socket.on('disconnect', () => {
      const roomId = (socket as SocketWithUser).currentRoomId
      if (roomId) {
        handleLeaveRoom(io, socket, roomId, user)
      }
      console.log(`[Socket] Disconnected: ${user.name} (${socket.id})`)
    })
  })
}

// ── Helpers ────────────────────────────────────────────

function handleLeaveRoom(
  io: SocketIOServer,
  socket: Socket,
  roomId: string,
  user: SocketUser
): void {
  socket.leave(roomId)
  roomUsers.get(roomId)?.delete(socket.id)
  if (roomUsers.get(roomId)?.size === 0) {
    roomUsers.delete(roomId)
  }
  broadcastRoomUsers(io, roomId)
  // Notify others this user's cursor should be removed
  socket.to(roomId).emit('user-left', { socketId: socket.id, userId: user.id })
  console.log(`[Socket] ${user.name} left room ${roomId}`)
}

function broadcastRoomUsers(io: SocketIOServer, roomId: string): void {
  const users = roomUsers.get(roomId)
  const userList = users
    ? Array.from(users.entries()).map(([socketId, state]) => ({
        socketId,
        user: state.user,
      }))
    : []
  io.to(roomId).emit('room-users', userList)
}

/** Parse the JWT token value from a raw Cookie header string */
function parseCookieToken(cookieHeader: string): string | null {
  const cookies = cookieHeader.split(';').map((c) => c.trim())
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split('=')
    if (name.trim() === 'token') {
      return rest.join('=')
    }
  }
  return null
}

// Extend Socket type to carry our custom properties
interface SocketWithUser extends Socket {
  user:          SocketUser
  currentRoomId?: string
}
