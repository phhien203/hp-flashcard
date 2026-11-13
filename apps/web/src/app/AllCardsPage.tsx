import { Button, CardTile, CategoryFilter, Checkbox } from '@hp-flashcard/ui'
import { useState, type ReactNode } from 'react'

import type { Category } from '../api/types.js'
import { useCardPages, useCategories, type CardFilters } from './queries.js'

const INITIAL_FILTERS: CardFilters = {
  categoryIds: [],
  hideMastered: false,
  seed: undefined,
}

export interface AllCardsPageProps {
  createShuffleSeed: () => number
}

/**
 * Browse the Card collection: filter it by Category and mastery, Shuffle
 * it, and load it 12 Cards at a time. The backend does the filtering,
 * shuffling and paging.
 */
export function AllCardsPage({ createShuffleSeed }: AllCardsPageProps) {
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const categories = useCategories()
  const cards = useCardPages(filters)

  const loaded = cards.data?.pages.flatMap((page) => page.items) ?? []
  const total = cards.data?.pages[0]?.total ?? 0
  const filtered = filters.categoryIds.length > 0 || filters.hideMastered

  return (
    <main className="flex flex-col gap-300">
      <h1 className="sr-only">All Cards</h1>

      <div className="flex flex-col gap-200 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-200">
          <CategoryFilter
            categories={categories.data?.items ?? []}
            value={namesOf(categories.data?.items, filters.categoryIds)}
            onValueChange={(names) =>
              setFilters((f) => ({
                ...f,
                categoryIds: idsOf(categories.data?.items, names),
              }))
            }
          />
          <label className="flex cursor-pointer items-center gap-100 text-preset-4-medium">
            <Checkbox
              checked={filters.hideMastered}
              onCheckedChange={(hideMastered) =>
                setFilters((f) => ({ ...f, hideMastered }))
              }
            />
            Hide Mastered
          </label>
        </div>
        <Button
          variant="outline"
          className="self-start sm:self-auto"
          onClick={() =>
            setFilters((f) => ({ ...f, seed: createShuffleSeed() }))
          }
        >
          Shuffle
        </Button>
      </div>

      {categories.isError && (
        <Notice role="alert" title="Categories could not be loaded.">
          <Button variant="outline" onClick={() => void categories.refetch()}>
            Retry
          </Button>
        </Notice>
      )}

      {cards.isPending ? (
        <Notice role="status" title="Loading cards…" />
      ) : cards.isError && !cards.data ? (
        <Notice role="alert" title="Cards could not be loaded.">
          <Button
            variant="outline"
            disabled={cards.isFetching}
            onClick={() => void cards.refetch()}
          >
            Retry
          </Button>
        </Notice>
      ) : loaded.length === 0 ? (
        filtered ? (
          <Notice
            title="No cards match your filters."
            description="Choose other Categories or show Mastered cards."
          >
            <Button
              variant="outline"
              onClick={() =>
                setFilters((f) => ({ ...INITIAL_FILTERS, seed: f.seed }))
              }
            >
              Clear filters
            </Button>
          </Notice>
        ) : (
          <Notice
            title="No cards yet."
            description="Cards you create will appear here."
          />
        )
      ) : (
        <>
          <ul
            aria-label="Cards"
            className="grid grid-cols-1 gap-200 md:grid-cols-2 md:gap-300 lg:grid-cols-3 xl:grid-cols-4"
          >
            {loaded.map((card) => (
              <li key={card.id} className="flex">
                <CardTile
                  className="flex-1"
                  question={card.question}
                  answer={card.answer}
                  category={card.category.name}
                  progress={card.progress}
                />
              </li>
            ))}
          </ul>

          {cards.isFetchNextPageError && (
            <Notice role="alert" title="More cards could not be loaded.">
              <Button
                variant="outline"
                disabled={cards.isFetchingNextPage}
                onClick={() => void cards.fetchNextPage()}
              >
                Retry
              </Button>
            </Notice>
          )}

          {cards.hasNextPage && !cards.isFetchNextPageError && (
            <Button
              variant="outline"
              className="self-center"
              disabled={cards.isFetchingNextPage}
              onClick={() => void cards.fetchNextPage()}
            >
              {cards.isFetchingNextPage ? 'Loading…' : 'Load More'}
            </Button>
          )}
        </>
      )}

      <p role="status" className="sr-only">
        {cards.isFetchingNextPage
          ? 'Loading more cards…'
          : cards.data
            ? `Showing ${loaded.length} of ${total} cards.`
            : ''}
      </p>
    </main>
  )
}

/** CategoryFilter speaks in names; the API in stable Category ids. */
const namesOf = (
  categories: readonly Category[] | undefined,
  ids: readonly string[],
) => ids.flatMap((id) => categories?.find((c) => c.id === id)?.name ?? [])

const idsOf = (
  categories: readonly Category[] | undefined,
  names: readonly string[],
) => names.flatMap((name) => categories?.find((c) => c.name === name)?.id ?? [])

function Notice({
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
