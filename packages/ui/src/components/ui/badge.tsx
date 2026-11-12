import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../lib/utils.js'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-50 rounded-full border px-150 py-50 text-preset-6 whitespace-nowrap',
  {
    variants: {
      variant: {
        // A card's category tag: follows the theme.
        outline: 'border-border bg-card text-card-foreground',
        // The "Mastered" pill: the same teal and dark ink in both themes.
        mastered:
          'border-mastered-foreground bg-mastered text-mastered-foreground',
      },
    },
    defaultVariants: {
      variant: 'outline',
    },
  },
)

type BadgeProps = Omit<ComponentProps<'span'>, 'children'> &
  VariantProps<typeof badgeVariants> & {
    children?: ReactNode
    /** Icon rendered before the text. Icons are decorative. */
    icon?: ReactNode
  }

/**
 * A small pill of text. `outline` (the default) is a card's category tag;
 * `mastered` is the teal "Mastered" pill, with an optional `icon`.
 */
function Badge({ variant, icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant ?? 'outline'}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {icon}
      {children}
    </span>
  )
}

export { Badge, type BadgeProps }
