import { Progress as ProgressPrimitive } from '@base-ui/react/progress'

import { cn } from '../../lib/utils.js'

type ProgressBaseProps = Omit<
  ProgressPrimitive.Root.Props,
  // format and locale are left out: the count and value text show plain
  // integers, so they would have no effect.
  'value' | 'min' | 'max' | 'children' | 'format' | 'locale'
> & {
  /**
   * How far along, from 0 to `max`. Values outside that range are clamped,
   * and a non-finite value counts as 0.
   */
  value: number
  /**
   * The value that fills the bar.
   * @default 5
   */
  max?: number
  /**
   * Show the `value/max` count (for example "2/5") beside the bar.
   * @default false
   */
  showCount?: boolean
}

/**
 * A progress bar has no visible label of its own, so it must be named with
 * `aria-label` or `aria-labelledby`.
 */
type ProgressProps = ProgressBaseProps &
  ({ 'aria-label': string } | { 'aria-labelledby': string })

/**
 * A card's mastery progress: a pill-shaped bar that fills from 0 to `max`
 * (5 by default), with an optional "n/5" count. Screen readers hear it as a
 * progress bar with its value, its max and "n of max".
 */
function Progress({
  value,
  max = 5,
  showCount = false,
  getAriaValueText,
  className,
  ...props
}: ProgressProps) {
  const clamped = Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : 0
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={clamped}
      min={0}
      max={max}
      getAriaValueText={
        getAriaValueText ?? (() => `${String(clamped)} of ${String(max)}`)
      }
      className={cn('inline-flex items-center gap-100', className)}
      {...props}
    >
      <ProgressPrimitive.Track
        data-slot="progress-track"
        className="h-100 w-1000 shrink-0 overflow-hidden rounded-full border border-border bg-card"
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="h-full bg-foreground"
        />
      </ProgressPrimitive.Track>
      {showCount ? (
        <span
          data-slot="progress-count"
          className="text-preset-6 text-foreground tabular-nums"
        >
          {clamped}/{max}
        </span>
      ) : null}
    </ProgressPrimitive.Root>
  )
}

export { Progress, type ProgressProps }
