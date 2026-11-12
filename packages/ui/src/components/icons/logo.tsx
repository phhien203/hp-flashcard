import type { SVGProps } from 'react'

import { cn } from '../../lib/utils.js'

// Stand-ins: the Figma Logo section (node 350:2584) couldn't be exported yet
// (#7), so these are drawn by hand to the documented sizes. Replace the
// artwork here when the Figma export lands; AppHeader needs no change.

type LogoArtProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'>

/** The 40×40 mark: a stack of two cards on the yellow primary tile. */
export function LogoMark({ className, ...props }: LogoArtProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      aria-hidden
      focusable="false"
      data-slot="logo-mark"
      className={cn('size-500 shrink-0', className)}
      {...props}
    >
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="10"
        strokeWidth="2"
        className="fill-primary stroke-primary-foreground"
      />
      <rect
        x="9"
        y="12"
        width="16"
        height="20"
        rx="3"
        strokeWidth="2"
        transform="rotate(-12 17 22)"
        className="fill-none stroke-primary-foreground"
      />
      <rect
        x="15"
        y="8"
        width="16"
        height="20"
        rx="3"
        strokeWidth="2"
        className="fill-card stroke-primary-foreground"
      />
    </svg>
  )
}

/** The full logo: the mark followed by the "Flashcard" wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="logo"
      className={cn('inline-flex items-center gap-150', className)}
    >
      <LogoMark />
      <span className="text-preset-2 text-foreground">Flashcard</span>
    </span>
  )
}
