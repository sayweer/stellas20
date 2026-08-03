import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'

const REVEAL_OPTIONS: IntersectionObserverInit = {
  threshold: 0.14,
  rootMargin: '0px 0px -10% 0px',
}

export function ScrollReveal({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}): ReactElement {
  const elementRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(
    () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window),
  )

  useEffect(() => {
    const element = elementRef.current
    if (!element || visible) return

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setVisible(true)
      observer.disconnect()
    }, REVEAL_OPTIONS)

    observer.observe(element)
    return () => observer.disconnect()
  }, [visible])

  return (
    <div
      ref={elementRef}
      className={`scroll-reveal ${className}`}
      data-visible={visible}
      onFocusCapture={() => setVisible(true)}
    >
      {children}
    </div>
  )
}
