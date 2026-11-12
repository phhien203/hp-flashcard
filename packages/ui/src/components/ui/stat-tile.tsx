import { cva } from 'class-variance-authority'
import { useId, type ComponentProps, type ReactNode } from 'react'

import { cn } from '../../lib/utils.js'

const accentPanel = cva(
  'flex w-1200 shrink-0 items-center justify-center border-l border-border text-stat-foreground *:size-400',
  {
    variants: {
      accent: {
        'blue-400': 'bg-stat-blue',
        'teal-400': 'bg-stat-teal',
        'pink-500': 'bg-stat-pink',
        'pink-400': 'bg-stat-pink-light',
      },
    },
  },
)

/** The Figma color of a StatTile's icon panel. */
type StatTileAccent = 'blue-400' | 'teal-400' | 'pink-500' | 'pink-400'

interface StatTileProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** What the number counts, for example "Total Cards". Names the tile. */
  label: ReactNode
  /** The number, shown large under the label. */
  value: ReactNode
  /**
   * The icon in the accent panel. It is decorative (hidden from screen
   * readers), drawn in neutral-900 and sized to 32px.
   */
  icon: ReactNode
  /**
   * The panel's color, one of the Figma primitives. It stays the same in
   * both themes.
   */
  accent: StatTileAccent
}

/**
 * A Study Statistics tile: a label, a large number and an icon on an
 * accent-colored panel. It is a group named by its label, so screen readers
 * hear the label with the number.
 */
function StatTile({
  label,
  value,
  icon,
  accent,
  className,
  ...props
}: StatTileProps) {
  const labelId = useId()

  return (
    <div
      data-slot="stat-tile"
      role="group"
      aria-labelledby={labelId}
      className={cn(
        'flex min-w-0 overflow-hidden rounded-12 border border-border bg-card text-card-foreground shadow-rest',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-150 p-250">
        <p id={labelId} className="text-preset-4-medium wrap-break-word">
          {label}
        </p>
        <p className="text-preset-1 wrap-break-word">{value}</p>
      </div>
      <div aria-hidden="true" className={accentPanel({ accent })}>
        {icon}
      </div>
    </div>
  )
}

export { StatTile, type StatTileAccent, type StatTileProps }
