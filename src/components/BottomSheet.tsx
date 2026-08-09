/** A sheet that rises from the bottom edge — the phone's answer to a popover. */
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import { IconButton } from './Button'
import { XIcon } from './icons'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  /** Heading for the sheet; also its accessible name. */
  title: string
  children: ReactNode
}

/**
 * Built on a native `<dialog>` opened with `showModal()`, which brings the
 * focus trap, the inert background, Escape-to-close and top-layer stacking
 * with it. Every one of those is a thing a hand-rolled overlay gets wrong, and
 * none of them cost a dependency here.
 *
 * There is no closing animation. Playing one means holding the dialog open
 * until `animationend` and tracking a third state between open and closed, and
 * the reader has already moved on by then — the opening is where the movement
 * carries meaning.
 */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    // `showModal()` makes the background inert to pointers but does not stop
    // it scrolling behind the sheet on iOS, which is the tell that separates a
    // web overlay from a native one.
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = previous
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        // A click on a child never has the dialog itself as its target, so this
        // is the whole backdrop test.
        if (event.target === dialogRef.current) onClose()
      }}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl border-t border-hairline bg-neutral-900 p-0 text-neutral-100 backdrop:bg-neutral-950/70 motion-safe:animate-sheet-in sm:mx-auto sm:mb-auto sm:mt-auto sm:max-w-md sm:rounded-3xl sm:border"
    >
      <div className="px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
        {/* The grabber says "this came from the bottom edge and goes back
            there" before the reader has read the title. */}
        <div
          aria-hidden="true"
          className="mx-auto mb-4 h-1 w-9 rounded-full bg-boundary sm:hidden"
        />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-medium tracking-[-0.01em]">{title}</h2>
          <IconButton
            variant="ghost"
            label="Close"
            icon={<XIcon className="h-5 w-5" />}
            onClick={onClose}
          />
        </div>
        {children}
      </div>
    </dialog>
  )
}
