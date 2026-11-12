import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'

import { cn } from '../../lib/utils.js'
import { IconCheck } from '../icons/icon-check.js'

type CheckboxProps = CheckboxPrimitive.Root.Props

/**
 * A two-state checkbox. Wrap it in a `<label>` with its text to name it and
 * to make the whole label clickable. Pass `checked` and `onCheckedChange` to
 * control it, or `defaultChecked` to leave its state to the component.
 */
function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative flex size-200 shrink-0 cursor-pointer items-center justify-center rounded-4 border border-input bg-card text-primary-foreground transition-shadow outline-none not-data-disabled:hover:shadow-rest focus-visible:border-ring focus-visible:ring-3 focus-visible:shadow-ring focus-visible:ring-ring/50 data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex text-current"
      >
        <IconCheck className="size-150" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox, type CheckboxProps }
