import type { ReactElement } from 'react'
import { useTheme } from '../context/ThemeContext'
import { MoonIcon, SunIcon } from './icons'

/** Explicit appearance control; the choice persists and defaults to the OS preference. */
export function ThemeToggle(): ReactElement {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Use ${nextTheme} theme`}
      title={`Use ${nextTheme} theme`}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-boundary text-neutral-400 transition-[color,background-color,border-color] duration-100 ease-out hover:bg-neutral-900 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:translate-y-px"
    >
      {theme === 'dark' ? (
        <SunIcon className="h-[18px] w-[18px]" />
      ) : (
        <MoonIcon className="h-[18px] w-[18px]" />
      )}
    </button>
  )
}
