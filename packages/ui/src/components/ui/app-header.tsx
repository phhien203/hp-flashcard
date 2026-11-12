import type { ComponentProps, ReactNode } from 'react'

import { Logo, LogoMark } from '../icons/logo.js'
import { cn } from '../../lib/utils.js'

interface AppHeaderProps extends Omit<ComponentProps<'header'>, 'children'> {
  /** The header's navigation, laid out at the end: usually a `SegmentedNav`. */
  nav?: ReactNode
  /**
   * Makes the logo a link to this URL, such as the home page. The link is
   * named "Flashcard" at every width.
   */
  logoHref?: string
}

/**
 * The app's shared header: the logo at the start and the navigation at the
 * end. Below `md` the logo shrinks to the 40×40 mark; from `md` up it shows
 * the full logo. It renders a `<header>`, the page's banner landmark.
 */
function AppHeader({ nav, logoHref, className, ...props }: AppHeaderProps) {
  const logo = (
    <>
      <LogoMark className="md:hidden" />
      <Logo className="hidden md:inline-flex" />
      {/* One name for both artworks, since only one is displayed. */}
      <span className="sr-only">Flashcard</span>
    </>
  )

  return (
    <header
      data-slot="app-header"
      className={cn('flex items-center justify-between gap-200', className)}
      {...props}
    >
      {logoHref === undefined ? (
        <span data-slot="app-header-logo" className="inline-flex">
          {logo}
        </span>
      ) : (
        <a
          href={logoHref}
          data-slot="app-header-logo"
          className="inline-flex rounded-8 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {logo}
        </a>
      )}
      {nav}
    </header>
  )
}

export { AppHeader, type AppHeaderProps }
