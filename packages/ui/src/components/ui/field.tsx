import { Field as FieldPrimitive } from '@base-ui/react/field'

import { cn } from '../../lib/utils.js'
import { IconError } from '../icons/icon-error.js'

type FieldProps = FieldPrimitive.Root.Props

/**
 * Groups a label, one control (`Input` or `Textarea`) and its error message,
 * and links them: the label names the control and a shown error describes
 * it. Set `invalid` (or use native constraints or `validate`) to put the
 * control in its error state.
 */
function Field({ className, ...props }: FieldProps) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn('flex w-full flex-col gap-100', className)}
      {...props}
    />
  )
}

type FieldLabelProps = FieldPrimitive.Label.Props

/** The visible label of the control in the same `Field`. */
function FieldLabel({ className, ...props }: FieldLabelProps) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn(
        'w-fit text-preset-5-medium text-foreground data-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

type FieldErrorProps = FieldPrimitive.Error.Props

/**
 * The error message of the control in the same `Field`, shown with the
 * error icon while the field is invalid. It is announced when it appears
 * and becomes the control's accessible description.
 *
 * Without children it shows the browser's validation message.
 * Place it on `bg-card`: in light, `text-destructive` keeps AA contrast
 * on that white surface but not on `bg-background`.
 */
function FieldError({ className, ...props }: FieldErrorProps) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      role="alert"
      className={cn(
        'flex items-center gap-75 text-preset-6 text-destructive',
        className,
      )}
      render={({ children, ...errorProps }) => (
        <div {...errorProps}>
          <IconError />
          <span>{children}</span>
        </div>
      )}
      {...props}
    />
  )
}

export {
  Field,
  FieldError,
  FieldLabel,
  type FieldErrorProps,
  type FieldLabelProps,
  type FieldProps,
}
