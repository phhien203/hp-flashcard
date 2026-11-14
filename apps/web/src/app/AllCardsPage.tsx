import {
  Button,
  CardTile,
  CategoryFilter,
  Checkbox,
  useToast,
} from '@hp-flashcard/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import type { Card, CategoryList } from '../api/types.js'
import { useApi } from './api-context.js'
import { idsOf, namesOf, withExistingCategories } from './category-selection.js'
import { CreateCardForm } from './CreateCardForm.js'
import { MASTERED } from '../domain/progress.js'
import { DeleteCardDialog } from './DeleteCardDialog.js'
import { EditCardDialog } from './EditCardDialog.js'
import { useKeptEdit } from './kept-edit.js'
import { Notice } from './Notice.js'
import {
  fetchCard,
  isNotFound,
  queryKeys,
  useCardPages,
  useCategories,
  type CardFilters,
} from './queries.js'

const INITIAL_FILTERS: CardFilters = {
  categoryIds: [],
  hideMastered: false,
  seed: undefined,
}

export interface AllCardsPageProps {
  createShuffleSeed: () => number
  /** Called when the create form starts or stops holding unsaved input. */
  onHasDraftChange: (hasDraft: boolean) => void
}

/**
 * Create Cards, and browse the collection: filter it by Category and
 * mastery, Shuffle it, and load it 12 Cards at a time. The backend does the
 * filtering, shuffling and paging.
 */
export function AllCardsPage({
  createShuffleSeed,
  onHasDraftChange,
}: AllCardsPageProps) {
  const [selectedFilters, setFilters] = useState(INITIAL_FILTERS)
  // An edit kept from this account's previous session reopens at once.
  const { restored } = useKeptEdit()
  const [resumed, setResumed] = useState(restored)
  const [editing, setEditing] = useState<Card | undefined>(restored?.card)
  const [deleting, setDeleting] = useState<{
    card: Card
    /** The Cards beside it when the dialog opened, to take focus after. */
    neighbourIds: string[]
  }>()
  const [revealing, setRevealing] = useState<string>()
  const categories = useCategories()
  // A selected Category that no longer exists (its last Card moved away)
  // drops out of the selection; none left means every Category.
  const filters = withExistingCategories(selectedFilters, categories.data)
  const cards = useCardPages(filters)
  const queryClient = useQueryClient()
  const api = useApi()
  const toast = useToast()
  const listRef = useRef<HTMLUListElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const loaded = cards.data?.pages.flatMap((page) => page.items) ?? []
  const total = cards.data?.pages[0]?.total ?? 0
  const filtered = filters.categoryIds.length > 0 || filters.hideMastered

  const cardElement = (cardId: string) =>
    listRef.current?.querySelector<HTMLElement>(
      `[data-card-id="${CSS.escape(cardId)}"]`,
    ) ?? null
  const cardActions = (cardId: string) =>
    cardElement(cardId)?.querySelector<HTMLElement>(
      '[aria-label="Card actions"]',
    ) ?? null

  // Toasts offering "Show card" act on this page: close them when it goes.
  const showCardToasts = useRef(new Set<string>())
  useEffect(() => {
    const ids = showCardToasts.current
    return () => ids.forEach((id) => toast.close(id))
  }, [toast])

  // The latest filters, for code that runs once a save has finished.
  const filtersRef = useRef(filters)
  useEffect(() => {
    filtersRef.current = filters
  })

  /** Confirms a save, and offers to show the Card if the filters hide it. */
  const confirmSaved = (card: Card, verb: 'created' | 'updated') => {
    const active = withExistingCategories(
      filtersRef.current,
      queryClient.getQueryData<CategoryList>(queryKeys.categories),
    )
    if (matches(card, active)) {
      toast.add({ title: `Card ${verb} successfully.` })
      return
    }
    const id = toast.add({
      title: `Card ${verb} successfully. Your filters hide it.`,
      // It waits for the user, who may want to act on it.
      timeout: 0,
      action: { label: 'Show card', onClick: () => void showCard(card.id) },
    })
    showCardToasts.current.add(id)
  }

  /** Clears the filters, then loads pages until the Card is on screen. */
  const showCard = async (cardId: string) => {
    try {
      await fetchCard(queryClient, api, cardId)
    } catch (error) {
      toast.add({
        title: isNotFound(error)
          ? 'That card no longer exists.'
          : 'The card could not be shown. Please try again.',
        priority: 'high',
      })
      return
    }
    // Shuffle isn't a filter: a shuffled order stays shuffled.
    setFilters((f) => ({ ...INITIAL_FILTERS, seed: f.seed }))
    setRevealing(cardId)
  }

  // Revealing a Card: load the next page until the Card is among the
  // loaded ones, then bring it into view and focus it.
  const revealedCard =
    revealing !== undefined && loaded.some((card) => card.id === revealing)
      ? revealing
      : undefined
  const needsNextPage =
    revealing !== undefined &&
    revealedCard === undefined &&
    !cards.isFetching &&
    cards.hasNextPage &&
    !cards.isFetchNextPageError
  const { fetchNextPage } = cards
  useEffect(() => {
    if (needsNextPage) void fetchNextPage()
  }, [needsNextPage, fetchNextPage])
  useEffect(() => {
    if (revealedCard === undefined) return
    const element = cardElement(revealedCard)
    element?.scrollIntoView({ block: 'center' })
    element?.focus({ preventScroll: true })
  }, [revealedCard])

  /** Changes the filters the user picks, ending any "Show card". */
  const changeFilters = (update: (filters: CardFilters) => CardFilters) => {
    setRevealing(undefined)
    setFilters(update)
  }

  return (
    <main className="flex flex-col gap-300">
      {/* Focusable from script only: it takes focus when a deleted Card
          leaves no other Card to go to. */}
      <h1 ref={headingRef} tabIndex={-1} className="sr-only">
        All Cards
      </h1>

      <CreateCardForm
        onHasDraftChange={onHasDraftChange}
        onCreated={(card) => confirmSaved(card, 'created')}
      />

      <div className="flex flex-col gap-200 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-200">
          <CategoryFilter
            categories={categories.data?.items ?? []}
            value={namesOf(categories.data?.items, filters.categoryIds)}
            onValueChange={(names) =>
              changeFilters((f) => ({
                ...f,
                categoryIds: idsOf(categories.data?.items, names),
              }))
            }
          />
          <label className="flex cursor-pointer items-center gap-100 text-preset-4-medium">
            <Checkbox
              checked={filters.hideMastered}
              onCheckedChange={(hideMastered) =>
                changeFilters((f) => ({ ...f, hideMastered }))
              }
            />
            Hide Mastered
          </label>
        </div>
        <Button
          variant="outline"
          className="self-start sm:self-auto"
          onClick={() =>
            changeFilters((f) => ({ ...f, seed: createShuffleSeed() }))
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
                changeFilters((f) => ({ ...INITIAL_FILTERS, seed: f.seed }))
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
            ref={listRef}
            aria-label="Cards"
            className="grid grid-cols-1 gap-200 md:grid-cols-2 md:gap-300 lg:grid-cols-3 xl:grid-cols-4"
          >
            {loaded.map((card) => (
              <li
                key={card.id}
                data-card-id={card.id}
                data-revealed={revealedCard === card.id ? '' : undefined}
                // Focusable from script only: "Show card" moves focus here.
                tabIndex={-1}
                onBlur={() => {
                  if (revealedCard === card.id) setRevealing(undefined)
                }}
                className="flex rounded-16 outline-none focus-visible:ring-2 focus-visible:ring-ring data-revealed:ring-2 data-revealed:ring-ring"
              >
                <CardTile
                  className="flex-1"
                  question={card.question}
                  answer={card.answer}
                  category={card.category.name}
                  progress={card.progress}
                  onEdit={() => setEditing(card)}
                  onDelete={() =>
                    setDeleting({
                      card,
                      neighbourIds: neighboursOf(loaded, card.id),
                    })
                  }
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

      {editing && (
        <EditCardDialog
          key={editing.id}
          card={editing}
          resumed={resumed?.card === editing ? resumed : undefined}
          onSaved={(card) => confirmSaved(card, 'updated')}
          onClosed={() => {
            setResumed(undefined)
            setEditing(undefined)
          }}
          returnFocusTo={() => cardActions(editing.id)}
        />
      )}

      {deleting && (
        <DeleteCardDialog
          key={deleting.card.id}
          card={deleting.card}
          onDeleted={(outcome) =>
            toast.add({
              title:
                outcome === 'deleted'
                  ? 'Card deleted successfully.'
                  : 'That card had already been deleted.',
            })
          }
          onClosed={() => setDeleting(undefined)}
          returnFocusTo={(deleted) => {
            if (!deleted) return cardActions(deleting.card.id)
            // The next Card, else the one before, else the page.
            for (const id of deleting.neighbourIds) {
              const actions = cardActions(id)
              if (actions) return actions
            }
            return headingRef.current
          }}
        />
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

/** The ids of the Cards after and before `cardId`, nearest first. */
function neighboursOf(cards: readonly Card[], cardId: string) {
  const index = cards.findIndex((card) => card.id === cardId)
  return [cards[index + 1], cards[index - 1]].flatMap((card) =>
    card ? [card.id] : [],
  )
}

/** Whether the filters let `card` through, as the backend decides it. */
const matches = (card: Card, { categoryIds, hideMastered }: CardFilters) =>
  (categoryIds.length === 0 || categoryIds.includes(card.category.id)) &&
  !(hideMastered && card.progress >= MASTERED)
