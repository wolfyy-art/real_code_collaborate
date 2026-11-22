import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import * as Y from 'yjs'
import { MonacoBinding } from 'y-monaco'
import * as awarenessProtocol from 'y-protocols/awareness'
import { io, Socket } from 'socket.io-client'
import { Code2, Wifi, WifiOff } from 'lucide-react'
import type * as monacoType from 'monaco-editor'

// ── User cursor colors ──────────────────────────────────────────────────────
const USER_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6',
]

function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i)
    hash |= 0
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length]
}

// ── Public types ────────────────────────────────────────────────────────────
export interface OnlineCollaborator {
  socketId: string
  user: { id: string; name: string; avatarUrl: string | null }
}

interface CodeEditorProps {
  roomId: string
  language: string
  initialCode: string
  currentUser: { id: string; name: string; avatarUrl: string | null }
  onCodeChange: (code: string) => void
  onOnlineUsersChange?: (users: OnlineCollaborator[]) => void
}

// ── Component ───────────────────────────────────────────────────────────────
export function CodeEditor({
  roomId,
  language,
  initialCode,
  currentUser,
  onCodeChange,
  onOnlineUsersChange,
}: CodeEditorProps) {
  const [connected, setConnected] = useState(false)

  // Stable refs — created once, never recreated on re-render
  const editorRef   = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null)
  const yDocRef     = useRef<Y.Doc | null>(null)
  const awarenessRef = useRef<awarenessProtocol.Awareness | null>(null)
  const socketRef   = useRef<Socket | null>(null)
  const bindingRef  = useRef<MonacoBinding | null>(null)

  // Track whether we have already set up the binding (guards against
  // React Strict Mode double-effect invocation and language-change re-renders)
  const bindingSetupDone = useRef(false)

  // We receive initialCode from the parent. Keep the latest value in a ref so
  // the socket effect closure never goes stale.
  const initialCodeRef = useRef(initialCode)
  useEffect(() => { initialCodeRef.current = initialCode }, [initialCode])

  // Stable callbacks — keep latest versions in refs so socket listeners
  // registered once always call the current version
  const onCodeChangeRef = useRef(onCodeChange)
  useEffect(() => { onCodeChangeRef.current = onCodeChange }, [onCodeChange])
  const onOnlineUsersChangeRef = useRef(onOnlineUsersChange)
  useEffect(() => { onOnlineUsersChangeRef.current = onOnlineUsersChange }, [onOnlineUsersChange])

  const userColor = useMemo(() => getUserColor(currentUser.id), [currentUser.id])

  // ── Derived display values ──────────────────────────────────────────────
  const monacoLanguage = useMemo(() => {
    if (language === 'python') return 'python'
    if (language === 'java')   return 'java'
    return 'javascript'
  }, [language])

  const fileName = useMemo(() => {
    if (language === 'python') return 'main.py'
    if (language === 'java')   return 'Main.java'
    return 'main.js'
  }, [language])

  // ── Attempt to form the MonacoBinding once both the editor AND the
  //    Y.Doc exist.  Called from onMount (editor ready) and from the
  //    socket useEffect (yDoc ready).  Whichever fires second will
  //    actually create the binding.
  const tryCreateBinding = useCallback(() => {
    const editor    = editorRef.current
    const yDoc      = yDocRef.current
    const awareness = awarenessRef.current

    if (!editor || !yDoc || !awareness || bindingSetupDone.current) return

    bindingSetupDone.current = true

    const yText = yDoc.getText('monaco')
    const model = editor.getModel()
    if (!model) return

    // Create the binding — MonacoBinding keeps Monaco and Y.Text in sync.
    // Pass an empty Monaco model (defaultValue is not set on <Editor> so
    // Monaco starts blank).  The yText content (populated by sync-full-state
    // or by the initial seed below) will flow into Monaco via the binding.
    bindingRef.current = new MonacoBinding(
      yText,
      model,
      new Set([editor]),
      awareness,
    )

    // Keep the parent's code state updated whenever yText changes (local or remote)
    yText.observe(() => {
      onCodeChangeRef.current(yText.toString())
    })
  }, [])

  // ── Monaco onMount — only stores the editor ref, then tries to bind ──────
  // We deliberately do NOT create Y.Doc or the socket here.
  // Those live in the useEffect below so they have proper cleanup.
  const handleEditorDidMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    tryCreateBinding()
  }, [tryCreateBinding])

  // ── Main collaboration effect ────────────────────────────────────────────
  // Runs once per roomId.  Creates Y.Doc → socket → registers all listeners.
  // Returns a full cleanup function.
  useEffect(() => {
    // ── 1. Create Y.Doc and awareness ──────────────────────────────────
    const yDoc      = new Y.Doc()
    const awareness = new awarenessProtocol.Awareness(yDoc)
    yDocRef.current      = yDoc
    awarenessRef.current = awareness

    // Set local user identity so remote clients can render our cursor
    awareness.setLocalStateField('user', {
      name:       currentUser.name,
      color:      userColor,
      colorLight: `${userColor}33`,
    })

    // ── 2. Create socket ───────────────────────────────────────────────
    const socketServerUrl =
      (import.meta.env.VITE_SOCKET_URL as string | undefined) ||
      (import.meta.env.VITE_API_URL  as string | undefined) ||
      '/'

    const authToken = localStorage.getItem('auth_token') ?? undefined

    const socket = io(socketServerUrl, {
      withCredentials: true,
      auth:            { token: authToken },
      // Prefer WebSocket; fall back to polling if WS is blocked
      transports:      ['websocket', 'polling'],
      // Reconnect automatically with backoff
      reconnection:        true,
      reconnectionAttempts: 10,
      reconnectionDelay:    1000,
    })
    socketRef.current = socket

    // ── 3. yDoc update handler — send local changes to server ──────────
    // Origin tag 'server' marks updates we applied FROM the server.
    // We must NOT echo those back — that would create an infinite loop.
    const handleYDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'server') return          // skip — came from server
      if (!socket.connected)   return          // skip — not yet connected
      socket.emit('sync-update', {
        roomId,
        update: Array.from(update),
      })
    }
    yDoc.on('update', handleYDocUpdate)

    // ── 4. Awareness update handler — send cursor/presence to server ───
    const handleAwarenessUpdate = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === 'server') return
      if (!socket.connected)   return
      const changed = [...added, ...updated, ...removed]
      const encoded = awarenessProtocol.encodeAwarenessUpdate(awareness, changed)
      socket.emit('awareness-update', {
        roomId,
        update: Array.from(encoded),
      })
    }
    awareness.on('update', handleAwarenessUpdate)

    // ── 5. Socket event listeners ──────────────────────────────────────

    socket.on('connect', () => {
      setConnected(true)
      console.log(`[CodeEditor] Socket connected — joining room ${roomId}`)
      socket.emit('join-room', roomId)
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('reconnect', () => {
      // Re-join the room after a reconnect so the server re-sends state
      setConnected(true)
      socket.emit('join-room', roomId)
    })

    // ── sync-full-state: server sends the complete document state ──────
    // This fires right after join-room.
    // FIX for BUG 2 & 5: initialCode is seeded HERE, not before socket
    // connects, and only when the server doc is empty.
    socket.on('sync-full-state', (stateBytes: number[]) => {
      try {
        const update = new Uint8Array(stateBytes)
        // Apply with origin='server' so we don't echo it back
        Y.applyUpdate(yDoc, update, 'server')

        const yText = yDoc.getText('monaco')

        // If the server doc is empty (brand-new room), seed with initialCode
        // so the first user sees the starter template.
        if (yText.length === 0 && initialCodeRef.current) {
          // This insert will fire yDoc.on('update') with origin=undefined,
          // which WILL be sent to the server — that is correct behaviour.
          // The server will then have this content for all future joiners.
          yDoc.transact(() => {
            yText.insert(0, initialCodeRef.current)
          })
        }

        onCodeChangeRef.current(yText.toString())

        // If Monaco is already mounted, attempt to create the binding now
        // (handles the case where editor mounted before socket connected)
        tryCreateBinding()
      } catch (err) {
        console.error('[CodeEditor] sync-full-state error:', err)
      }
    })

    // ── sync-update: incremental Yjs update from another user ──────────
    socket.on('sync-update', (updateBytes: number[]) => {
      try {
        const update = new Uint8Array(updateBytes)
        Y.applyUpdate(yDoc, update, 'server')
      } catch (err) {
        console.error('[CodeEditor] sync-update error:', err)
      }
    })

    // ── awareness-update: remote cursor/presence ────────────────────────
    socket.on(
      'awareness-update',
      (data: { socketId: string; update?: number[] }) => {
        try {
          if (data.update) {
            awarenessProtocol.applyAwarenessUpdate(
              awareness,
              new Uint8Array(data.update),
              'server',
            )
          }
        } catch (err) {
          console.error('[CodeEditor] awareness-update error:', err)
        }
      },
    )

    // ── room-users: online user list from server ────────────────────────
    socket.on('room-users', (users: OnlineCollaborator[]) => {
      onOnlineUsersChangeRef.current?.(users)
    })

    // ── user-left: remove ghost cursors ────────────────────────────────
    socket.on('user-left', ({ socketId }: { socketId: string; userId: string }) => {
      // y-protocols awareness tracks states by clientID not socketId,
      // but the server already removes the state from the awareness map,
      // so just trigger a re-render by re-requesting room-users indirectly.
      // The MonacoBinding reads awareness and will remove the cursor.
      console.log(`[CodeEditor] User left: ${socketId}`)
    })

    // ── 6. After setting up all listeners, attempt binding ─────────────
    // (Handles the case where Monaco was already mounted before this effect ran)
    tryCreateBinding()

    // ── Cleanup ────────────────────────────────────────────────────────
    return () => {
      console.log(`[CodeEditor] Cleaning up room ${roomId}`)

      // Destroy MonacoBinding first (stops syncing Monaco ↔ yText)
      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
      }

      // Tell server we're leaving
      if (socket.connected) {
        socket.emit('leave-room', roomId)
      }

      // Remove all socket listeners, then disconnect
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null

      // Destroy awareness (cleans up remote cursor states)
      awareness.destroy()
      awarenessRef.current = null

      // Destroy Y.Doc
      yDoc.destroy()
      yDocRef.current = null

      // Reset binding guard so a new roomId creates a fresh binding
      bindingSetupDone.current = false

      setConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]) // Re-run only when room changes — intentionally excludes currentUser/initialCode (read via refs)

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-editor-bg">

      {/* Tab bar */}
      <div className="flex items-center border-b border-editor-border bg-editor-sidebar px-2 gap-1 h-9">
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b-2 border-brand bg-editor-bg text-xs text-white">
          <Code2 className="h-3.5 w-3.5 text-brand" />
          <span>{fileName}</span>
        </div>

        {/* Live sync indicator */}
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1 text-xs text-gray-400">
          {connected ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <Wifi className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Live CRDT Sync</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-yellow-400">
              <WifiOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Connecting...</span>
            </span>
          )}
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 w-full overflow-hidden">
        <Editor
          height="100%"
          theme="vs-dark"
          language={monacoLanguage}
          // Do NOT pass defaultValue — the MonacoBinding and Y.Text
          // own the content.  Passing defaultValue would fight with Yjs.
          onMount={handleEditorDidMount}
          options={{
            fontSize:              14,
            fontFamily:            "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
            lineNumbers:           'on',
            lineDecorationsWidth:  10,
            lineNumbersMinChars:   3,
            renderLineHighlight:   'all',
            minimap:               { enabled: false },
            bracketPairColorization: { enabled: true },
            autoClosingBrackets:   'always',
            autoClosingQuotes:     'always',
            tabSize:               2,
            insertSpaces:          true,
            scrollBeyondLastLine:  false,
            automaticLayout:       true,
            wordWrap:              'off',
            cursorBlinking:        'smooth',
            cursorSmoothCaretAnimation: 'on',
            suggestOnTriggerCharacters: true,
            quickSuggestions:      true,
            padding:               { top: 12, bottom: 12 },
          }}
        />
      </div>
    </div>
  )
}
