import { Link, useNavigate } from 'react-router-dom'
import { Code2, LogOut, LayoutDashboard } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { authApi } from '@/services/api'
import { Avatar } from './Avatar'
import toast from 'react-hot-toast'

interface NavbarProps {
  /** Show dashboard link and user info. False on landing/login pages. */
  showUserMenu?: boolean
}

export function Navbar({ showUserMenu = true }: NavbarProps) {
  const { user, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    toast.success('Logged out')
    navigate('/')
  }

  return (
    <nav className="h-14 border-b border-editor-border bg-editor-sidebar px-4 flex items-center justify-between shrink-0">
      {/* Logo */}
      <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2 group">
        <div className="p-1.5 rounded-md bg-brand/10 group-hover:bg-brand/20 transition-colors">
          <Code2 className="h-5 w-5 text-brand" />
        </div>
        <span className="text-base font-bold text-white tracking-tight">CodeCollab</span>
      </Link>

      {/* Right side */}
      {showUserMenu && isAuthenticated && user ? (
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="btn-secondary hidden sm:inline-flex gap-1.5 py-1.5">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <div className="flex items-center gap-2 pl-3 border-l border-editor-border">
            <Avatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
            <span className="text-sm text-gray-300 hidden md:block max-w-[120px] truncate">
              {user.name}
            </span>
          </div>
          <button onClick={handleLogout} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors" title="Logout">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : showUserMenu ? (
        <a href={authApi.githubLoginUrl()} className="btn-primary py-1.5 text-sm">
          Sign in with GitHub
        </a>
      ) : null}
    </nav>
  )
}
