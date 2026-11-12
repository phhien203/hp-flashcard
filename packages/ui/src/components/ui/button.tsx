import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { cn } from '../../lib/utils.js'

const buttonVariants = cva(
  // Rest: shadow-rest. Hover: shadow-hover. Keyboard focus: border and
  // shadow switch to the ring color. Disabled: faded, no pointer events.
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-100 rounded-full border border-border text-preset-4-semibold whitespace-nowrap shadow-rest transition-shadow outline-none select-none hover:shadow-hover focus-visible:border-ring focus-visible:shadow-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        // Figma's "Border": no fill of its own, so it shows the surface.
        outline: 'bg-transparent text-foreground',
      },
      size: {
        default: 'h-600 px-250',
        icon: 'size-600',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

type ButtonBaseProps = Omit<ButtonPrimitive.Props, 'children'> &
  Omit<VariantProps<typeof buttonVariants>, 'size'>

/** A label, with optional icons before and after it. */
interface ButtonTextProps {
  size?: 'default' | null
  children?: ReactNode
  /** Icon rendered before the label. Icons are decorative. */
  leadingIcon?: ReactNode
  /** Icon rendered after the label. Icons are decorative. */
  trailingIcon?: ReactNode
}

/**
 * Icon only. With no visible label, the button must be named with
 * `aria-label` or `aria-labelledby`.
 */
type ButtonIconProps = {
  size: 'icon'
  /** The icon. */
  children: ReactNode
  leadingIcon?: never
  trailingIcon?: never
} & ({ 'aria-label': string } | { 'aria-labelledby': string })

type ButtonProps = ButtonBaseProps & (ButtonTextProps | ButtonIconProps)

function Button({
  className,
  variant = 'primary',
  size = 'default',
  leadingIcon,
  trailingIcon,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants, type ButtonProps }
