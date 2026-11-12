import { Field as FieldPrimitive } from '@base-ui/react/field'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/utils.js'
import { textControlClassName } from './text-control.js'

/*
 * Base UI has no Textarea, so the textarea is rendered through
 * `Field.Control` to join a `Field` (label, invalid state, error link).
 * `Field.Control` is typed for an input, hence the textarea-shaped props
 * here, passed to the rendered element; only `onValueChange` goes to the
 * control itself.
 */
type TextareaProps = Omit<ComponentProps<'textarea'>, 'className'> & {
  className?: string
  /** Called with the new value on every change. */
  onValueChange?: FieldPrimitive.Control.Props['onValueChange']
}

/**
 * A multi-line text input. Inside a `Field` it is labelled by `FieldLabel`
 * and described by `FieldError` automatically.
 */
function Textarea({ className, onValueChange, ...props }: TextareaProps) {
  return (
    <FieldPrimitive.Control
      data-slot="textarea"
      onValueChange={onValueChange}
      className={cn(
        textControlClassName,
        'block min-h-1200 resize-y',
        className,
      )}
      render={<textarea {...props} />}
    />
  )
}

export { Textarea, type TextareaProps }
