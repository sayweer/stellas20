import type { ReactElement } from 'react'
import { useTheme } from '../context/ThemeContext'
import { IconButton } from './Button'
import { MoonIcon, SunIcon } from './icons'

/** Explicit appearance control; the choice persists and defaults to the OS preference. */
export function ThemeToggle(): ReactElement {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <IconButton
      onClick={toggleTheme}
      label={`Use ${nextTheme} theme`}
      icon={
        theme === 'dark' ? (
          <SunIcon className="h-[18px] w-[18px]" />
        ) : (
          <MoonIcon className="h-[18px] w-[18px]" />
        )
      }
    />
  )
}
