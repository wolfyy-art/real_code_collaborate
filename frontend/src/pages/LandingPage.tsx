import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { authApi } from '@/services/api'
import {
  Code2, Users, Zap, GitBranch, Terminal, History,
  ChevronRight, Globe, Lock, Cpu
} from 'lucide-react'

export default function LandingPage() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-screen bg-editor-bg text-gray-100 overflow-auto">

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 border-b border-editor-border bg-editor-bg/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-brand/10">
              <Code2 className="h-5 w-5 text-brand" />
            </div>
            <span className="text-lg font-bold text-white">CodeCollab</span>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn-primary gap-1.5">
                Go to Dashboard <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-secondary hidden sm:inline-flex">Sign In</Link>
                <a href={authApi.githubLoginUrl()} className="btn-primary gap-1.5">
                  Get Started <ChevronRight className="h-4 w-4" />
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-brand/5 rounded-full blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 pt-24 pb-20 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-brand/30 bg-brand/5 text-brand text-xs font-medium mb-8">
            <Zap className="h-3 w-3" />
            Real-Time Collaboration · Powered by Yjs CRDT
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white leading-tight mb-6">
            Code Together,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-sky-300">
              In Real Time
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            A collaborative code editor where multiple developers write, run, and review
            code simultaneously — like Google Docs, but for code.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <a
              href="/auth/github"
              className="btn-primary text-base px-7 py-3 gap-2 shadow-lg shadow-brand/20"
            >
              <GitBranch className="h-5 w-5" />
              Login with GitHub — it's free
            </a>
            <Link to="/login" className="btn-secondary text-base px-7 py-3">
              Learn More
            </Link>
          </div>

          {/* Trust line */}
          <p className="text-xs text-gray-600 mt-6">
            No credit card required · B.Tech CS Project · CRDT-based conflict-free editing
          </p>
        </div>

        {/* ── Code preview mockup ──────────────────────────────── */}
        <div className="mx-auto max-w-4xl px-6 pb-16">
          <div className="rounded-xl border border-editor-border bg-editor-sidebar overflow-hidden shadow-2xl">
            {/* Window bar */}
            <div className="flex items-center gap-2 px-4 py-3 bg-editor-toolbar border-b border-editor-border">
              <div className="h-3 w-3 rounded-full bg-red-500/70" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
              <div className="h-3 w-3 rounded-full bg-green-500/70" />
              <span className="ml-3 text-xs text-gray-500 font-mono">main.py — Room: CS-Project</span>
              <div className="ml-auto flex items-center gap-2">
                {/* Fake live users */}
                {['Mayank', 'Reshav'].map((name, i) => (
                  <div key={name} className="flex items-center gap-1.5">
                    <div className={`h-2 w-2 rounded-full ${i === 0 ? 'bg-brand' : 'bg-green-400'}`} />
                    <span className="text-xs text-gray-400">{name}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Code */}
            <div className="p-5 font-mono text-sm leading-7 overflow-x-auto">
              <pre className="text-gray-300">{CODE_PREVIEW}</pre>
            </div>
            {/* Output bar */}
            <div className="border-t border-editor-border bg-editor-bg px-5 py-3">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                <Terminal className="h-3.5 w-3.5" />
                <span>Output</span>
                <span className="ml-auto text-green-400">● Accepted  0.042s</span>
              </div>
              <p className="font-mono text-sm text-green-300">Hello, World!</p>
              <p className="font-mono text-sm text-green-300">Sum: 15  |  Fibonacci: [0, 1, 1, 2, 3, 5, 8]</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-white mb-3">Everything you need to code together</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Built with production-grade technologies used in real collaborative tools.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="card group hover:border-brand/50 hover:bg-editor-highlight transition-all duration-200"
            >
              <div className="h-10 w-10 rounded-lg bg-brand/10 flex items-center justify-center mb-4 group-hover:bg-brand/20 transition-colors">
                <f.icon className="h-5 w-5 text-brand" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────── */}
      <section className="border-t border-editor-border bg-editor-sidebar/40">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white mb-3">How it works</h2>
            <p className="text-gray-400">Start collaborating in under 60 seconds</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <div key={s.title} className="flex flex-col items-center text-center">
                <div className="relative mb-5">
                  <div className="h-14 w-14 rounded-2xl bg-brand/10 border border-brand/30 flex items-center justify-center">
                    <s.icon className="h-6 w-6 text-brand" />
                  </div>
                  <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{s.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech stack ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <p className="text-center text-xs text-gray-600 uppercase tracking-widest mb-8">Built with</p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {TECH.map((t) => (
            <span key={t} className="px-4 py-2 rounded-full bg-editor-sidebar border border-editor-border text-sm text-gray-400">
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────── */}
      <section className="border-t border-editor-border">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to collaborate?</h2>
          <p className="text-gray-400 mb-8">
            Create a room, share the link, and start coding together instantly.
          </p>
          <a href={authApi.githubLoginUrl()} className="btn-primary text-base px-8 py-3 gap-2 shadow-lg shadow-brand/20 mx-auto">
            <GitBranch className="h-5 w-5" />
            Start with GitHub
          </a>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-editor-border px-6 py-8">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-brand" />
            <span className="text-sm text-gray-500">
              CodeCollab — B.Tech CSE Project, 2026
            </span>
          </div>
          <div className="text-sm text-gray-600">
            Mayank Saroha (11723210041) &nbsp;·&nbsp; Reshav Govindam (11723210003)
          </div>
        </div>
      </footer>
    </div>
  )
}

// ── Static data ───────────────────────────────────────────

const CODE_PREVIEW = `# collaborative editing — both users typing live
def greet(name: str) -> str:
    return f"Hello, {name}!"

def fibonacci(n: int) -> list:
    seq = [0, 1]
    while len(seq) < n:
        seq.append(seq[-1] + seq[-2])
    return seq[:n]

print(greet("World"))
print(f"Sum: {sum(range(6))}  |  Fibonacci: {fibonacci(7)}")`

const FEATURES = [
  {
    icon: Users,
    title: 'Real-Time Collaboration',
    desc: 'Multiple users edit the same file simultaneously. Changes sync instantly with zero conflicts using Yjs CRDT.',
  },
  {
    icon: Code2,
    title: 'Live Cursors',
    desc: "See every participant's cursor and selection in real time with distinct color-coded indicators.",
  },
  {
    icon: Terminal,
    title: 'Code Execution',
    desc: 'Run Python, JavaScript, and Java in a secure sandboxed environment powered by Judge0.',
  },
  {
    icon: History,
    title: 'Version History',
    desc: 'Auto-saved snapshots every 30 seconds with full diff comparison and one-click restore.',
  },
  {
    icon: Globe,
    title: 'Shareable Rooms',
    desc: 'Create a room and share a link. Anyone with the link can join and start collaborating instantly.',
  },
  {
    icon: Lock,
    title: 'Secure by Default',
    desc: 'JWT auth via HttpOnly cookies, GitHub OAuth, rate limiting, and input validation throughout.',
  },
  {
    icon: GitBranch,
    title: 'GitHub Login',
    desc: 'One-click OAuth — no passwords to create or remember. Your GitHub identity, your rooms.',
  },
  {
    icon: Cpu,
    title: 'Horizontally Scalable',
    desc: 'Redis Pub/Sub adapter lets multiple backend instances share collaboration events seamlessly.',
  },
  {
    icon: Zap,
    title: 'Monaco Editor',
    desc: 'The same editor engine that powers VS Code — syntax highlighting, autocomplete, and more.',
  },
]

const STEPS = [
  {
    icon: GitBranch,
    title: 'Sign in with GitHub',
    desc: 'One click to authenticate. No forms, no passwords. Your GitHub profile is all you need.',
  },
  {
    icon: Globe,
    title: 'Create or Join a Room',
    desc: 'Create a new coding room and share the link — or paste a link someone shared with you.',
  },
  {
    icon: Code2,
    title: 'Code Together',
    desc: 'Write code, see live cursors, run programs, and browse version history — all in one place.',
  },
]

const TECH = [
  'React 18', 'TypeScript', 'Vite', 'Tailwind CSS',
  'Monaco Editor', 'Yjs CRDT', 'Socket.IO',
  'Node.js', 'Express', 'PostgreSQL', 'Prisma',
  'Redis', 'Docker', 'Judge0',
]
