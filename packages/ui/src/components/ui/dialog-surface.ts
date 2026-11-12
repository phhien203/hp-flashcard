import { cn } from '../../lib/utils.js'

type ClassValue = Parameters<typeof cn>[number]

/*
 * Shared look of Dialog and AlertDialog, from the Figma "Edit card" and
 * "Delete card" modals. Each class list sits in a `cn` call so the Tailwind
 * lint rules check it.
 */

/**
 * The scrim behind the popup. It is the same near-black in both themes, so
 * it uses the primitive rather than a role.
 */
export const dialogBackdropClassName = () =>
  cn('fixed inset-0 z-50 bg-neutral-950/50')

/**
 * The popup: centred, with a 16px gutter on narrow screens, and never wider
 * than the `container-dialog` token.
 */
export const dialogPopupClassName = (className?: ClassValue) =>
  cn(
    'fixed inset-x-200 top-1/2 z-50 mx-auto flex max-w-dialog -translate-y-1/2 flex-col gap-250 rounded-16 border border-border bg-card p-300 text-card-foreground shadow-hover outline-none',
    className,
  )

export const dialogTitleClassName = (className?: ClassValue) =>
  cn('text-preset-2 text-card-foreground', className)

export const dialogDescriptionClassName = (className?: ClassValue) =>
  cn('text-preset-4-regular text-muted-foreground', className)
