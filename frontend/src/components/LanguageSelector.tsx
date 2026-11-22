import clsx from 'clsx'

export type Language = 'python' | 'javascript' | 'java'

// eslint-disable-next-line react-refresh/only-export-components
export const LANGUAGES: { value: Language; label: string; icon: string; color: string }[] = [
  { value: 'python',     label: 'Python',     icon: '🐍', color: 'text-yellow-400' },
  { value: 'javascript', label: 'JavaScript', icon: '⚡', color: 'text-yellow-300' },
  { value: 'java',       label: 'Java',       icon: '☕', color: 'text-orange-400' },
]

interface LanguageSelectorProps {
  value: Language
  onChange: (lang: Language) => void
  disabled?: boolean
  className?: string
}

export function LanguageSelector({ value, onChange, disabled, className }: LanguageSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Language)}
      disabled={disabled}
      className={clsx(
        'bg-editor-toolbar border border-editor-border rounded-md px-3 py-1.5',
        'text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand',
        'cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      {LANGUAGES.map((l) => (
        <option key={l.value} value={l.value}>
          {l.icon}  {l.label}
        </option>
      ))}
    </select>
  )
}

/** Inline badge showing the language */
export function LanguageBadge({ language }: { language: string }) {
  const lang = LANGUAGES.find((l) => l.value === language)
  return (
    <span className={clsx('badge bg-editor-toolbar', lang?.color ?? 'text-gray-400')}>
      {lang?.icon} {lang?.label ?? language}
    </span>
  )
}
