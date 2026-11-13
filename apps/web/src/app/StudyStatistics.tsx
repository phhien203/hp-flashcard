import { Button, StatTile, type StatTileAccent } from '@hp-flashcard/ui'
import type { UseQueryResult } from '@tanstack/react-query'
import { useId, type ReactNode } from 'react'

import type { CardStatistics } from '../api/types.js'
import { Notice } from './Notice.js'

/*
 * The tiles' icons, drawn in a 16×16 box in currentColor. StatTile hides
 * them from assistive technology and sizes them.
 */
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 16 16" fill="currentColor" focusable="false">
    {children}
  </svg>
)

/** Two stacked cards. */
const IconCards = () =>
  svg(
    <path d="M4 1.5h8A1.5 1.5 0 0 1 13.5 3v9A1.5 1.5 0 0 1 12 13.5H4A1.5 1.5 0 0 1 2.5 12V3A1.5 1.5 0 0 1 4 1.5Zm0 1.5v9h8V3H4Zm-2.5 12h10v-1h-10a.5.5 0 0 1-.5-.5V4H0v9.5A1.5 1.5 0 0 0 1.5 15Z" />,
  )

/** A ring: nothing yet. */
const IconNotStarted = () =>
  svg(
    <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 1.75a5.25 5.25 0 1 0 0 10.5 5.25 5.25 0 0 0 0-10.5Z" />,
  )

/** A half-filled ring: on the way. */
const IconInProgress = () =>
  svg(
    <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 1.75a5.25 5.25 0 1 0 0 10.5V2.75Z" />,
  )

/** A check mark. */
const IconMastered = () =>
  svg(<path d="M6.4 12.1 2.3 8l1.3-1.3 2.8 2.8 6-6 1.3 1.3z" />)

const TILES: {
  key: keyof CardStatistics
  label: string
  accent: StatTileAccent
  icon: ReactNode
}[] = [
  {
    key: 'total',
    label: 'Total Cards',
    accent: 'blue-400',
    icon: <IconCards />,
  },
  {
    key: 'mastered',
    label: 'Mastered',
    accent: 'teal-400',
    icon: <IconMastered />,
  },
  {
    key: 'inProgress',
    label: 'In Progress',
    accent: 'pink-500',
    icon: <IconInProgress />,
  },
  {
    key: 'notStarted',
    label: 'Not Started',
    accent: 'pink-400',
    icon: <IconNotStarted />,
  },
]

/**
 * Study Statistics: how many Cards in the chosen Categories there are, and
 * how many are Mastered, In Progress and Not Started. Hide Mastered,
 * Shuffle and paging don't change them.
 */
export function StudyStatistics({
  statistics,
}: {
  statistics: UseQueryResult<CardStatistics>
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-200">
      <h2 id={headingId} className="text-preset-2">
        Study Statistics
      </h2>
      {statistics.isError && !statistics.data ? (
        <Notice role="alert" title="Statistics could not be loaded.">
          <Button
            variant="outline"
            disabled={statistics.isFetching}
            onClick={() => void statistics.refetch()}
          >
            Retry
          </Button>
        </Notice>
      ) : (
        <div className="grid grid-cols-1 gap-200 sm:grid-cols-2 xl:grid-cols-1">
          {TILES.map(({ key, label, accent, icon }) => (
            <StatTile
              key={key}
              label={label}
              value={statistics.data?.[key] ?? '–'}
              accent={accent}
              icon={icon}
            />
          ))}
        </div>
      )}
    </section>
  )
}
