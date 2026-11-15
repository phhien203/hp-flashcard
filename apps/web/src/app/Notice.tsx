import { Button } from '@hp-flashcard/ui'
import type { ReactNode } from 'react'

/** A centred message in a card, for loading, empty and failure states. */
export function Notice({
  title,
  description,
  role,
  children,
}: {
  title: string
  description?: string
  role?: 'status' | 'alert'
  children?: ReactNode
}) {
  return (
    <div
      role={role}
      className="flex flex-col items-center gap-200 rounded-16 border border-border bg-card px-300 py-500 text-center text-card-foreground shadow-rest"
    >
      <div className="flex flex-col gap-100">
        <p className="text-preset-3">{title}</p>
        {description && (
          <p className="text-preset-4-regular text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  )
}

export interface LoadFailedNoticeProps {
  /** What failed, e.g. "Cards could not be loaded." */
  title: string
  /** Whether the Retry is already under way, so it can't be sent twice. */
  retrying?: boolean
  onRetry: () => void
}

/** A read failed with nothing to show in its place: say so and offer Retry. */
export function LoadFailedNotice({
  title,
  retrying = false,
  onRetry,
}: LoadFailedNoticeProps) {
  return (
    <Notice role="alert" title={title}>
      <Button variant="outline" disabled={retrying} onClick={onRetry}>
        Retry
      </Button>
    </Notice>
  )
}
