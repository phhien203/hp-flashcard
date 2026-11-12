import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { useEffect, type ReactNode } from 'react'

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

// Module-scoped, so it does not clash with @types/node. Like React, this relies
// on the bundler replacing the literal `process.env.NODE_ENV` (Vite's library
// build leaves it for the consumer), which drops the warning from production.
declare const process: { env: { NODE_ENV?: string } }

const isBlank = (value: string | undefined) => !value?.trim()

/**
 * The types require a name for `size="icon"` but accept an empty string, so
 * warn in development when the icon-only button is left without one.
 */
function useIconNameWarning(
  size: ButtonProps['size'],
  label: string | undefined,
  labelledBy: string | undefined,
) {
  const unnamed = size === 'icon' && isBlank(label) && isBlank(labelledBy)
  useEffect(() => {
    if (unnamed && process.env.NODE_ENV !== 'production') {
      console.warn(
        'Button: size="icon" has no visible label, so it needs a non-blank `aria-label` or `aria-labelledby`.',
      )
    }
  }, [unnamed])
}

function Button({
  className,
  variant = 'primary',
  size = 'default',
  leadingIcon,
  trailingIcon,
  children,
  ...props
}: ButtonProps) {
  useIconNameWarning(size, props['aria-label'], props['aria-labelledby'])

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
