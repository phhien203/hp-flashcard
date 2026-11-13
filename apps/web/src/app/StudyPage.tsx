import {
  Button,
  buttonVariants,
  CategoryFilter,
  Checkbox,
  Flashcard,
} from '@hp-flashcard/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { Card } from '../api/types.js'
import { idsOf, namesOf, withExistingCategories } from './category-selection.js'
import { Notice } from './Notice.js'
import {
  MASTERED,
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

/** Every visit starts here: all Categories, Mastered shown, default order. */
const INITIAL_FILTERS: CardFilters = {
  categoryIds: [],
  hideMastered: false,
  seed: undefined,
}

/** A Progress save, and what to do once it succeeds. */
interface ProgressSave {
  cardId: string
  progress: number
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
  const queryClient = useQueryClient()

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
        void queryClient.prefetchQuery(studyPageOptions(filters, offset))
    }
  }, [queryClient, filters, index, pageOffset, total])

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
    save.mutate(variables, {
      onSuccess: (saved) => {
        if (view.current !== started) return
        setFlipped(false)
        if (variables.kind === 'reset') return
        // The listings have refetched: read how many Cards match now.
        const now =
          queryClient.getQueryData(
            studyPageOptions(filters, pageOffset).queryKey,
          )?.total ?? 0
        // A Card Hide Mastered now excludes has left the collection, so
        // the next Card has taken its position.
        const excluded = filters.hideMastered && saved.progress >= MASTERED
        const next = excluded ? index : index + 1
        setIndex(now > 0 ? next % now : 0)
      },
    })
  }

  const empty = cards.isSuccess && total === 0
  const noCards =
    empty && (!filters.hideMastered || categories.data?.items.length === 0)
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
          <div className="flex flex-wrap items-center gap-200">
            <CategoryFilter
              categories={categories.data?.items ?? []}
              value={namesOf(categories.data?.items, filters.categoryIds)}
              onValueChange={(names) =>
                changeFilters((f) => ({
                  ...f,
                  categoryIds: idsOf(categories.data?.items, names),
                  seed: undefined,
                }))
              }
            />
            <label className="flex cursor-pointer items-center gap-100 text-preset-4-medium">
              <Checkbox
                checked={filters.hideMastered}
                onCheckedChange={(hideMastered) =>
                  changeFilters((f) => ({
                    ...f,
                    hideMastered,
                    seed: undefined,
                  }))
                }
              />
              Hide Mastered
            </label>
          </div>
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
            <Notice role="alert" title="Categories could not be loaded.">
              <Button
                variant="outline"
                onClick={() => void categories.refetch()}
              >
                Retry
              </Button>
            </Notice>
          </div>
        )}

        {cards.isError && !card ? (
          <div className="p-200 md:p-300">
            <Notice role="alert" title="Cards could not be loaded.">
              <Button
                variant="outline"
                disabled={cards.isFetching}
                onClick={() => void cards.refetch()}
              >
                Retry
              </Button>
            </Notice>
          </div>
        ) : empty ? (
          noCards ? (
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
          ) : (
            <EmptyState
              title="You’re all caught up!"
              description={
                filters.categoryIds.length > 0
                  ? 'All cards in the selected categories are mastered. Turn off “Hide Mastered” to study them again.'
                  : 'All your cards are mastered. Turn off “Hide Mastered” to study them again.'
              }
            />
          )
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
                      kind: 'reset',
                    })
                  }
                >
                  Reset Progress
                </Button>
              </div>
              {save.isError && lastSave && (
                <Notice
                  role="alert"
                  title="Your progress could not be saved."
                  description="The card keeps its previous progress."
                >
                  <Button
                    variant="outline"
                    onClick={() => saveProgress(lastSave)}
                  >
                    Retry
                  </Button>
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

function EmptyState({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
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
