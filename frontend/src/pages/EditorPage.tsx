import { useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Play, Save, Copy, Check, ChevronDown, ChevronUp,
  History, Users, ArrowLeft, AlertCircle, Clock,
  Terminal, X, Maximize2, Minimize2, Code2
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { useRoom } from '@/hooks/useRoom'
import { Spinner, FullPageSpinner } from '@/components/Spinner'
import { Avatar, AvatarGroup } from '@/components/Avatar'
import { LanguageSelector, Language } from '@/components/LanguageSelector'
import { Modal } from '@/components/Modal'
import { CodeEditor, OnlineCollaborator } from '@/components/CodeEditor'
import { codeApi, versionsApi } from '@/services/api'
import { getRoomShareUrl } from '@/utils/shareUrl'

// ── Types ──────────────────────────────────────────────────
interface ExecutionResult {
  mock?: boolean
  stdout: string | null
  stderr: string | null
  compile_output: string | null
  status: { id: number; description: string }
  time: string | null
  memory: number | null
  message?: string
}

interface Version {
  id: string
  versionNumber: number
  language: string
  createdAt: string
  createdBy: { id: string; name: string; avatarUrl: string | null } | null
}

export default function EditorPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const { room, isLoading, error } = useRoom(roomId)

  // ── UI panel state ─────────────────────────────────────
  const [outputOpen,  setOutputOpen]  = useState(true)
  const [outputMax,   setOutputMax]   = useState(false)
  const [versionOpen, setVersionOpen] = useState(false)
  const [shareOpen,   setShareOpen]   = useState(false)

  // ── Editor state (will be wired to Monaco in Phase 4) ──
  const [language, setLanguage] = useState<Language>(
    (room?.language as Language) ?? 'python'
  )
  const [code, setCode] = useState(room?.currentCode ?? DEFAULT_CODE['python'])

  // ── Execution state ────────────────────────────────────
  const [running,  setRunning]  = useState(false)
  const [output,   setOutput]   = useState<ExecutionResult | null>(null)

  // ── Save state ─────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // ── Versions state ─────────────────────────────────────
  const [versions,       setVersions]       = useState<Version[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)

  // ── Online users (populated by Socket.IO in Phase 4) ──
  const [onlineUsers, setOnlineUsers] = useState<OnlineCollaborator[]>([])

  // ── Copy invite link ───────────────────────────────────
  const [copied, setCopied] = useState(false)
  const shareUrl = roomId ? getRoomShareUrl(roomId) : ''

  function copyLink() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    toast.success('Invite link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Run code ───────────────────────────────────────────
  const runCode = useCallback(async () => {
    if (!roomId) return
    setRunning(true)
    setOutputOpen(true)
    setOutput(null)
    try {
      const result = await codeApi.execute(roomId, { code, language })
      setOutput(result)
    } catch {
      toast.error('Execution failed — check your connection')
    } finally {
      setRunning(false)
    }
  }, [roomId, code, language])

  // ── Save snapshot ──────────────────────────────────────
  const saveSnapshot = useCallback(async () => {
    if (!roomId) return
    setSaving(true)
    try {
      await versionsApi.save(roomId, code, language)
      setLastSaved(new Date())
      toast.success('Snapshot saved!')
    } catch {
      toast.error('Save failed')
    } finally {
      setSaving(false)
    }
  }, [roomId, code, language])

  // ── Load versions ──────────────────────────────────────
  const loadVersions = useCallback(async () => {
    if (!roomId) return
    setVersionsLoading(true)
    try {
      const data = await versionsApi.list(roomId)
      setVersions(data)
    } catch {
      toast.error('Failed to load versions')
    } finally {
      setVersionsLoading(false)
    }
  }, [roomId])

  function toggleVersionPanel() {
    setVersionOpen((v) => {
      if (!v) loadVersions()
      return !v
    })
  }

  // ── Restore version ────────────────────────────────────
  async function restoreVersion(versionId: string) {
    if (!roomId) return
    if (!confirm('Restore this version? It will become the current code.')) return
    try {
      const result = await versionsApi.restore(roomId, versionId)
      toast.success('Version restored!')
      // In Phase 4 this will update the Yjs doc; for now update local state
      setCode(result.newSnapshot?.code ?? code)
      loadVersions()
    } catch {
      toast.error('Restore failed')
    }
  }

  // ── Language change ────────────────────────────────────
  function handleLanguageChange(lang: Language) {
    setLanguage(lang)
    if (!code || code === DEFAULT_CODE[language]) {
      setCode(DEFAULT_CODE[lang])
    }
  }

  // ── Loading / error states ─────────────────────────────
  if (isLoading) return <FullPageSpinner message="Loading room..." />

  if (error) return (
    <div className="h-screen bg-editor-bg flex flex-col items-center justify-center gap-4">
      <AlertCircle className="h-12 w-12 text-red-400" />
      <p className="text-white font-semibold text-lg">{error}</p>
      <button onClick={() => navigate('/dashboard')} className="btn-secondary gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>
    </div>
  )

  // The online participants to show in the navbar
  const participants = onlineUsers.length > 0
    ? onlineUsers.map((u) => u.user)
    : room?.members.map((m) => m.user) ?? []

  return (
    <div className="h-screen flex flex-col bg-editor-bg overflow-hidden">

      {/* ══════════════════════════════════════════════════
          TOP NAVBAR
      ══════════════════════════════════════════════════ */}
      <header className="h-12 shrink-0 bg-editor-toolbar border-b border-editor-border
                         flex items-center px-3 gap-3 z-20">

        {/* Back + Room name */}
        <Link to="/dashboard" className="p-1.5 rounded hover:bg-editor-highlight text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="h-5 w-px bg-editor-border" />

        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="h-4 w-4 text-brand shrink-0" />
          <span className="font-semibold text-white text-sm truncate max-w-[160px]">
            {room?.name}
          </span>
          <span className="text-gray-600 text-xs font-mono hidden sm:block">
            #{roomId?.slice(0, 8)}
          </span>
        </div>

        {/* Language selector */}
        <div className="ml-1">
          <LanguageSelector value={language} onChange={handleLanguageChange} />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Save indicator */}
        {lastSaved && (
          <span className="text-xs text-gray-500 hidden md:flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Saved {formatDistanceToNow(lastSaved, { addSuffix: true })}
          </span>
        )}

        {/* Online participants */}
        <div className="flex items-center gap-2 pl-2 border-l border-editor-border">
          <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <AvatarGroup users={participants} max={4} />
          <span className="text-xs text-gray-500 hidden sm:block">
            {participants.length} online
          </span>
        </div>

        {/* Share */}
        <button
          onClick={() => setShareOpen(true)}
          className="btn-secondary py-1 px-2.5 gap-1.5 text-xs hidden sm:inline-flex"
        >
          <Users className="h-3.5 w-3.5" />
          Share
        </button>

        {/* Save */}
        <button
          onClick={saveSnapshot}
          disabled={saving}
          className="btn-secondary py-1 px-2.5 gap-1.5 text-xs"
        >
          {saving ? <Spinner size="sm" /> : <Save className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">Save</span>
        </button>

        {/* Run */}
        <button
          onClick={runCode}
          disabled={running}
          className="btn-primary py-1 px-3 gap-1.5 text-xs"
        >
          {running
            ? <Spinner size="sm" />
            : <Play className="h-3.5 w-3.5 fill-current" />}
          Run
        </button>
      </header>

      {/* ══════════════════════════════════════════════════
          MAIN CONTENT — sidebar + editor + panels
      ══════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT SIDEBAR ────────────────────────────── */}
        <aside className="w-48 shrink-0 bg-editor-sidebar border-r border-editor-border
                          flex flex-col hidden md:flex">
          <div className="px-3 py-2 border-b border-editor-border">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Files</p>
          </div>
          {/* Single file — Phase 4 can expand this */}
          <div className="px-2 py-1">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-editor-highlight">
              <Code2 className="h-3.5 w-3.5 text-brand shrink-0" />
              <span className="text-xs text-white truncate font-mono">
                {language === 'python' ? 'main.py'
                  : language === 'javascript' ? 'main.js'
                  : 'Main.java'}
              </span>
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Members list */}
          <div className="border-t border-editor-border px-3 py-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Members</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {room?.members.map((m) => {
                const isOnline = onlineUsers.some((u) => u.user.id === m.user.id)
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <div className="relative">
                      <Avatar name={m.user.name} avatarUrl={m.user.avatarUrl} size="xs" />
                      <div className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-editor-sidebar
                                      ${isOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
                    </div>
                    <span className="text-xs text-gray-400 truncate">{m.user.name}</span>
                    {m.role === 'owner' && (
                      <span className="ml-auto text-xs text-brand/70">★</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* ── EDITOR + PANELS (right column) ──────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Monaco Editor area */}
          <div className={`flex-1 overflow-hidden relative ${outputMax ? 'hidden' : ''}`}>
            {roomId && (
              <CodeEditor
                roomId={roomId}
                language={language}
                initialCode={room?.currentCode || DEFAULT_CODE[language]}
                currentUser={{
                  id: user?.id ?? 'guest',
                  name: user?.name ?? 'Guest Developer',
                  avatarUrl: user?.avatarUrl ?? null,
                }}
                onCodeChange={setCode}
                onOnlineUsersChange={setOnlineUsers}
              />
            )}
          </div>

          {/* ── OUTPUT PANEL ──────────────────────────── */}
          <div className={`shrink-0 border-t border-editor-border bg-editor-bg flex flex-col
                          ${outputMax ? 'flex-1' : 'h-52'}`}>

            {/* Panel header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-editor-border bg-editor-toolbar">
              <Terminal className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-300">Output</span>

              {output && (
                <span className={`ml-1 badge text-xs ${
                  output.status.id === 3 ? 'bg-green-500/10 text-green-400'
                  : output.status.id === 6 ? 'bg-red-500/10 text-red-400'
                  : 'bg-yellow-500/10 text-yellow-400'
                }`}>
                  {output.status.description}
                  {output.time && ` · ${output.time}s`}
                </span>
              )}

              {output?.mock && (
                <span className="badge bg-yellow-500/10 text-yellow-400 text-xs">MOCK MODE</span>
              )}

              <div className="ml-auto flex items-center gap-1">
                {/* Version history toggle */}
                <button
                  onClick={toggleVersionPanel}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-colors
                              ${versionOpen ? 'bg-brand/10 text-brand' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <History className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">History</span>
                </button>

                <button
                  onClick={() => setOutputMax((v) => !v)}
                  className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {outputMax ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>

                <button
                  onClick={() => { setOutputOpen((v) => !v); setOutputMax(false) }}
                  className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {outputOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Panel content */}
            {outputOpen && (
              <div className="flex-1 overflow-auto p-4 font-mono text-sm">
                {running ? (
                  <div className="flex items-center gap-3 text-gray-400">
                    <Spinner size="sm" />
                    <span>Running your code...</span>
                  </div>
                ) : output ? (
                  <OutputDisplay result={output} />
                ) : (
                  <p className="text-gray-600">
                    Click <span className="text-brand">▶ Run</span> to execute your code.
                    {output === null && ' Output will appear here.'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── VERSION HISTORY PANEL ─────────────────── */}
          {versionOpen && (
            <div className="shrink-0 h-56 border-t border-editor-border bg-editor-sidebar flex flex-col">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-editor-border bg-editor-toolbar">
                <History className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-300">Version History</span>
                <span className="ml-auto text-xs text-gray-600">{versions.length} snapshots</span>
                <button onClick={() => setVersionOpen(false)} className="p-1 text-gray-500 hover:text-gray-300">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {versionsLoading ? (
                  <div className="flex justify-center py-6"><Spinner /></div>
                ) : versions.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <p className="text-gray-500 text-sm">No snapshots yet</p>
                    <p className="text-gray-600 text-xs mt-1">Click Save to create one</p>
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-editor-sidebar">
                      <tr className="text-gray-500 border-b border-editor-border">
                        <th className="text-left px-4 py-1.5 font-medium">Version</th>
                        <th className="text-left px-4 py-1.5 font-medium">When</th>
                        <th className="text-left px-4 py-1.5 font-medium">By</th>
                        <th className="px-4 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map((v) => (
                        <tr key={v.id} className="border-b border-editor-border/50 hover:bg-editor-highlight group">
                          <td className="px-4 py-2 text-brand font-mono">v{v.versionNumber}</td>
                          <td className="px-4 py-2 text-gray-400">
                            {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                          </td>
                          <td className="px-4 py-2 text-gray-400">
                            {v.createdBy?.name ?? 'Auto-save'}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={() => restoreVersion(v.id)}
                              className="opacity-0 group-hover:opacity-100 text-xs text-brand hover:underline transition-opacity"
                            >
                              Restore
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── SHARE MODAL ─────────────────────────────── */}
      <Modal isOpen={shareOpen} onClose={() => setShareOpen(false)} title="Share Room" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Share this link with anyone you want to collaborate with.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              className="input text-xs font-mono flex-1"
            />
            <button onClick={copyLink} className="btn-primary px-3 shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="text-xs text-gray-600">
            Room ID: <span className="font-mono text-gray-400">{roomId}</span>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Output Display ─────────────────────────────────────────
function OutputDisplay({ result }: { result: ExecutionResult }) {
  const hasOutput = result.stdout || result.stderr || result.compile_output

  return (
    <div className="space-y-3">
      {result.mock && (
        <div className="px-3 py-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
          ⚠️ {result.message}
        </div>
      )}

      {result.stdout && (
        <div>
          <p className="text-gray-500 text-xs mb-1">stdout</p>
          <pre className="text-green-300 whitespace-pre-wrap">{result.stdout}</pre>
        </div>
      )}

      {result.stderr && (
        <div>
          <p className="text-gray-500 text-xs mb-1">stderr</p>
          <pre className="text-red-400 whitespace-pre-wrap">{result.stderr}</pre>
        </div>
      )}

      {result.compile_output && (
        <div>
          <p className="text-gray-500 text-xs mb-1">compile output</p>
          <pre className="text-yellow-400 whitespace-pre-wrap">{result.compile_output}</pre>
        </div>
      )}

      {!hasOutput && (
        <p className="text-gray-500 italic">No output produced.</p>
      )}

      {result.memory != null && result.memory > 0 && (
        <p className="text-gray-600 text-xs pt-1 border-t border-editor-border">
          Memory: {(result.memory / 1024).toFixed(1)} MB
        </p>
      )}
    </div>
  )
}

// ── Default starter code per language ─────────────────────
const DEFAULT_CODE: Record<Language, string> = {
  python: `# Python — collaborative editor
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("World"))
`,
  javascript: `// JavaScript — collaborative editor
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));
`,
  java: `// Java — collaborative editor
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
`,
}
