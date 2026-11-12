import { Input as InputPrimitive } from '@base-ui/react/input'

import { cn } from '../../lib/utils.js'
import { textControlClassName } from './text-control.js'

type InputProps = InputPrimitive.Props

/**
 * A single-line text input. Inside a `Field` it is labelled by `FieldLabel`
 * and described by `FieldError` automatically.
 */
function Input({ className, ...props }: InputProps) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(textControlClassName, className)}
      {...props}
    />
  )
}

export { Input, type InputProps }
