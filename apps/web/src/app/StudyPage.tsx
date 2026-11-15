import { Button, buttonVariants, Flashcard } from '@hp-flashcard/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { Card } from '../api/types.js'
import { progressFingerprint } from '../domain/idempotency.js'
import { MASTERED } from '../domain/progress.js'
import { useApi } from './api-context.js'
import { CardFilterControls, INITIAL_FILTERS } from './CardFilterControls.js'
import { withExistingCategories } from './category-selection.js'
import { useIdempotencyKeys } from './idempotency-keys.js'
import { LoadFailedNotice, Notice } from './Notice.js'
import {
  PAGE_SIZE,
  studyPageOptions,
  useCardStatistics,
  useCategories,
  useSetProgress,
  useStudyPage,
  type CardFilters,
} from './queries.js'
import { ROUTE_HREFS } from './router.js'
import { StudyStatistics } from './StudyStatistics.js'
import { progressSaveFailure } from './write-failures.js'

/** A Progress save, and what to do once it succeeds. */
interface ProgressSave {
  cardId: string
  progress: number
  /** The Card's `progressVersion` the save is based on. */
  progressVersion: number
  /** `score` moves on to the next Card; `reset` stays on this one. */
  kind: 'score' | 'reset'
}

export interface StudyPageProps {
  createShuffleSeed: () => number
}

/**
 * Study one Card at a time: reveal its answer, credit "I Know This" towards
 * mastery or reset its Progress, and move through every matching Card,
 * wrapping at both ends. The filters, Shuffle, position and side shown live
 * here and start afresh on each visit; Progress is saved by the backend.
 * The collection comes a page at a time, by position, so a Card that leaves
 * it (Mastered under Hide Mastered) never makes the next one skipped.
 */
export function StudyPage({ createShuffleSeed }: StudyPageProps) {
  const [selectedFilters, setFilters] = useState(INITIAL_FILTERS)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const categories = useCategories()
  const filters = withExistingCategories(selectedFilters, categories.data)
  const pageOffset = index - (index % PAGE_SIZE)
  const cards = useStudyPage(filters, pageOffset)
  const statistics = useCardStatistics(filters.categoryIds)
  const save = useSetProgress()
  // One key per intended save, repeated by Retry: credited at most once.
  const keys = useIdempotencyKeys()
  const queryClient = useQueryClient()
  const api = useApi()

  const total = cards.data?.total ?? 0
  const card: Card | undefined = cards.data?.items[index - pageOffset]
  // The collection shrank under the position: start again from the first.
  if (cards.data && index > 0 && index >= total) setIndex(0)

  // Load the pages of the Cards either side, so moving on is instant.
  useEffect(() => {
    if (total < 2) return
    for (const neighbour of [
      (index + 1) % total,
      (index - 1 + total) % total,
    ]) {
      const offset = neighbour - (neighbour % PAGE_SIZE)
      if (offset !== pageOffset)
        void queryClient.prefetchQuery(studyPageOptions(api, filters, offset))
    }
  }, [queryClient, api, filters, index, pageOffset, total])

  // Bumped by every change of view, so a save that finishes after one
  // doesn't move the new view.
  const view = useRef(0)

  /** Shows the question of the Card at `next`, ending any failed save. */
  const goTo = (next: number) => {
    view.current++
    save.reset()
    setIndex(next)
    setFlipped(false)
  }

  const changeFilters = (update: (filters: CardFilters) => CardFilters) => {
    setFilters(update)
    goTo(0)
  }

  // The latest save, for Retry after a failure.
  const [lastSave, setLastSave] = useState<ProgressSave>()

  const saveProgress = (variables: ProgressSave) => {
    const started = view.current
    setLastSave(variables)
    const { cardId, progress, progressVersion } = variables
    const idempotencyKey = keys.keyFor(
      progressFingerprint(cardId, progressVersion, progress),
    )
    save.mutate(
      { cardId, progress, write: { progressVersion, idempotencyKey } },
      {
        onSuccess: ({ value: saved }) => {
          keys.done()
          if (view.current !== started) return
          setFlipped(false)
          if (variables.kind === 'reset') return
          // The listings have refetched: read how many Cards match now.
          const now =
            queryClient.getQueryData(
              studyPageOptions(api, filters, pageOffset).queryKey,
            )?.total ?? 0
          // A Card Hide Mastered now excludes has left the collection, so
          // the next Card has taken its position.
          const excluded = filters.hideMastered && saved.progress >= MASTERED
          const next = excluded ? index : index + 1
          setIndex(now > 0 ? next % now : 0)
        },
      },
    )
  }
  const failure = save.isError ? progressSaveFailure(save.error) : undefined

  const empty = cards.isSuccess && total === 0
  // Under Hide Mastered, an empty listing means no Cards only when there are
  // none to hide: no Categories, or (when those fail to load) no Cards
  // counted in the chosen ones.
  const noCards =
    empty &&
    (!filters.hideMastered ||
      categories.data?.items.length === 0 ||
      statistics.data?.total === 0)
  const single = total === 1
  const mastered = card !== undefined && card.progress >= MASTERED
  const busy = save.isPending

  return (
    <main className="grid grid-cols-1 gap-300 xl:grid-cols-3 xl:items-start">
      <h1 className="sr-only">Study Mode</h1>

      <section
        aria-label="Study"
        className="flex min-w-0 flex-col overflow-hidden rounded-16 border border-border bg-card text-card-foreground shadow-rest xl:col-span-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-200 border-b border-border p-200 md:px-300">
          <CardFilterControls
            categories={categories.data?.items}
            filters={filters}
            // Other Cards, other order: a filter change ends the Shuffle.
            onChange={(change) =>
              changeFilters((f) => ({ ...f, ...change, seed: undefined }))
            }
          />
          <Button
            variant="outline"
            disabled={total < 2 || busy}
            onClick={() =>
              changeFilters((f) => ({ ...f, seed: createShuffleSeed() }))
            }
          >
            Shuffle
          </Button>
        </div>

        {categories.isError && (
          <div className="p-200 md:px-300">
            <LoadFailedNotice
              title="Categories could not be loaded."
              onRetry={() => void categories.refetch()}
            />
          </div>
        )}

        {cards.isError && !card ? (
          <div className="p-200 md:p-300">
            <LoadFailedNotice
              title="Cards could not be loaded."
              retrying={cards.isFetching}
              onRetry={() => void cards.refetch()}
            />
          </div>
        ) : empty ? (
          <NothingToStudy
            noCards={noCards}
            categoriesChosen={filters.categoryIds.length > 0}
          />
        ) : !card ? (
          <div className="p-200 md:p-300">
            <Notice role="status" title="Loading cards…" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-300 p-200 md:p-300">
              <Flashcard
                question={card.question}
                answer={card.answer}
                category={card.category.name}
                progress={card.progress}
                flipped={flipped}
                onFlippedChange={setFlipped}
              />
              <div className="flex flex-col gap-150 sm:flex-row sm:justify-center sm:gap-200">
                <Button
                  disabled={mastered || busy}
                  onClick={() =>
                    saveProgress({
                      cardId: card.id,
                      progress: Math.min(card.progress + 1, MASTERED),
                      progressVersion: card.progressVersion,
                      kind: 'score',
                    })
                  }
                >
                  {mastered ? 'Already Mastered' : 'I Know This'}
                </Button>
                <Button
                  variant="outline"
                  disabled={card.progress === 0 || busy}
                  onClick={() =>
                    saveProgress({
                      cardId: card.id,
                      progress: 0,
                      progressVersion: card.progressVersion,
                      kind: 'reset',
                    })
                  }
                >
                  Reset Progress
                </Button>
              </div>
              {failure && lastSave && (
                <Notice
                  role="alert"
                  title={failure.title}
                  description={failure.description}
                >
                  {failure.retry && (
                    <Button
                      variant="outline"
                      onClick={() => saveProgress(lastSave)}
                    >
                      Retry
                    </Button>
                  )}
                </Notice>
              )}
            </div>

            <nav
              aria-label="Cards"
              className="flex items-center justify-between gap-200 border-t border-border p-200 md:px-300"
            >
              <Button
                variant="outline"
                disabled={single || busy}
                onClick={() => goTo((index - 1 + total) % total)}
              >
                Previous
              </Button>
              <p className="text-preset-5-medium whitespace-nowrap text-muted-foreground tabular-nums">
                Card {index + 1} of {total}
              </p>
              <Button
                variant="outline"
                disabled={single || busy}
                onClick={() => goTo((index + 1) % total)}
              >
                Next
              </Button>
            </nav>
          </>
        )}
      </section>

      <StudyStatistics statistics={statistics} />

      <p role="status" className="sr-only">
        {busy ? 'Saving progress…' : ''}
      </p>
    </main>
  )
}

interface NothingToStudyProps {
  /** No Cards at all, rather than every matching Card Mastered and hidden. */
  noCards: boolean
  /** Whether the person narrowed the Cards to some Categories. */
  categoriesChosen: boolean
}

/** Why there is no Card to show, and the way on. */
function NothingToStudy({ noCards, categoriesChosen }: NothingToStudyProps) {
  if (noCards)
    return (
      <EmptyState
        title="No cards to study"
        description="You don’t have any cards yet. Add your first card in the All Cards tab."
      >
        <a
          href={ROUTE_HREFS['all-cards']}
          className={buttonVariants({ variant: 'primary' })}
        >
          Go to All Cards
        </a>
      </EmptyState>
    )
  return (
    <EmptyState
      title="You’re all caught up!"
      description={
        categoriesChosen
          ? 'All cards in the selected categories are mastered. Turn off “Hide Mastered” to study them again.'
          : 'All your cards are mastered. Turn off “Hide Mastered” to study them again.'
      }
    />
  )
}

interface EmptyStateProps {
  title: string
  description: string
  children?: ReactNode
}

function EmptyState({ title, description, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-300 px-300 py-1000 text-center">
      <div className="flex flex-col gap-100">
        <h2 className="text-preset-2">{title}</h2>
        <p className="text-preset-4-regular text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  )
}
