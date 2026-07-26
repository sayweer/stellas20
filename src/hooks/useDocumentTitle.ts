import { useEffect } from 'react'

/**
 * Sets `document.title` for the active route and restores the previous one on
 * unmount. Every route used to inherit the single title from index.html, so a
 * bookmark or a browser-history entry for the app read the same as the
 * marketing page.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}
