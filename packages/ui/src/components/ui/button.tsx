import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils.js'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-10 border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-200",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/80',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-muted aria-expanded:bg-secondary aria-expanded:text-secondary-foreground dark:hover:bg-muted/50',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        // destructive text keeps AA contrast only on card (white in light).
        destructive:
          'border-destructive bg-card text-destructive hover:underline',
        link: 'text-foreground underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-400 gap-75 px-125 has-data-[icon=inline-end]:pr-100 has-data-[icon=inline-start]:pl-100',
        xs: "h-250 gap-50 rounded-8 px-100 text-xs in-data-[slot=button-group]:rounded-10 has-data-[icon=inline-end]:pr-75 has-data-[icon=inline-start]:pl-75 [&_svg:not([class*='size-'])]:size-150",
        sm: "h-300 gap-50 rounded-8 px-125 text-xs in-data-[slot=button-group]:rounded-10 has-data-[icon=inline-end]:pr-75 has-data-[icon=inline-start]:pl-75 [&_svg:not([class*='size-'])]:size-150",
        lg: 'h-500 gap-75 px-125 has-data-[icon=inline-end]:pr-100 has-data-[icon=inline-start]:pl-100',
        icon: 'size-400',
        'icon-xs':
          "size-250 rounded-8 in-data-[slot=button-group]:rounded-10 [&_svg:not([class*='size-'])]:size-150",
        'icon-sm': 'size-300 rounded-8 in-data-[slot=button-group]:rounded-10',
        'icon-lg': 'size-500',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants, type ButtonProps }
