import {
  QueryClient,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { ApiError, type ApiClient } from '../api/client.js'
import type { Card, CardInput, CardPatch } from '../api/types.js'
import { useApi } from './api-context.js'

/** How many Cards each request asks for: the first view and each Load More. */
export const PAGE_SIZE = 12

/** The Progress of a Mastered Card, and the most a Card can have. */
export const MASTERED = 5

/** What All Cards, or Study Mode, is asking the backend for. */
export interface CardFilters {
  categoryIds: readonly string[]
  hideMastered: boolean
  /** The Shuffle seed, or `undefined` for the default order. */
  seed: number | undefined
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // Failures show at once, with a Retry button, instead of after
      // silent automatic retries.
      queries: { retry: false },
    },
  })
}

/** Query keys, so every read and every invalidation agrees on them. */
export const queryKeys = {
  cardLists: ['cards', 'list'] as const,
  card: (cardId: string) => ['cards', 'detail', cardId] as const,
  categories: ['categories'] as const,
  statistics: ['cards', 'statistics'] as const,
}

/** The `category` parameter: repeated, or absent for every Category. */
const categoryQuery = (categoryIds: readonly string[]) =>
  categoryIds.length > 0 ? [...categoryIds] : undefined

/** The query parameters both listings send for `filters`. */
const listQuery = ({ categoryIds, hideMastered, seed }: CardFilters) => ({
  category: categoryQuery(categoryIds),
  hideMastered: hideMastered || undefined,
  seed,
})

/** The matching Cards, a page of 12 at a time, paged by the backend. */
export function useCardPages({ categoryIds, hideMastered, seed }: CardFilters) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: [...queryKeys.cardLists, { categoryIds, hideMastered, seed }],
    queryFn: ({ pageParam, signal }) =>
      api.listCards(
        {
          ...listQuery({ categoryIds, hideMastered, seed }),
          offset: pageParam,
          limit: PAGE_SIZE,
        },
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    // Drop a listing as soon as nothing shows it, so returning to All Cards,
    // or to an earlier filter, starts again from the first 12 matches
    // instead of restoring every page loaded before.
    gcTime: 0,
  })
}

/**
 * The page of matching Cards that starts at `offset`, for Study Mode, which
 * shows one Card at a time and moves through the collection a page at a
 * time. Every write refetches it, so it always reflects the collection.
 */
export const studyPageOptions = (
  api: ApiClient,
  { categoryIds, hideMastered, seed }: CardFilters,
  offset: number,
) =>
  queryOptions({
    queryKey: [
      ...queryKeys.cardLists,
      'study',
      { categoryIds, hideMastered, seed, offset },
    ],
    queryFn: ({ signal }) =>
      api.listCards(
        {
          ...listQuery({ categoryIds, hideMastered, seed }),
          offset,
          limit: PAGE_SIZE,
        },
        signal,
      ),
  })

/** The Study Mode page of matching Cards that starts at `offset`. */
export const useStudyPage = (filters: CardFilters, offset: number) =>
  useQuery(studyPageOptions(useApi(), filters, offset))

/**
 * How many Cards in the Categories (every Category when none) are Not
 * Started, In Progress and Mastered, across the whole collection.
 */
export function useCardStatistics(categoryIds: readonly string[]) {
  const api = useApi()
  return useQuery({
    queryKey: [...queryKeys.statistics, { categoryIds }],
    queryFn: ({ signal }) =>
      api.getCardStatistics({ category: categoryQuery(categoryIds) }, signal),
  })
}

/** Every Category with its global Card count. */
export function useCategories() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => api.listCategories(signal),
  })
}

/** Fetches one Card, fresh from the backend. */
export const fetchCard = (
  queryClient: QueryClient,
  api: ApiClient,
  cardId: string,
) =>
  queryClient.fetchQuery({
    queryKey: queryKeys.card(cardId),
    queryFn: ({ signal }) => api.getCard(cardId, signal),
    staleTime: 0,
  })

/**
 * After a successful write: store the saved Card and refetch every Card
 * listing and the Category counts. The mutation stays pending until they
 * have arrived, so the screen changes once, when it is coherent.
 */
async function afterWrite(queryClient: QueryClient, card: Card) {
  queryClient.setQueryData(queryKeys.card(card.id), card)
  await refetchCollection(queryClient)
}

/**
 * Refetches every Card listing, the statistics and the global Category
 * counts. Listings and statistics refetch even when nothing shows them, so
 * a page Study Mode loaded ahead never shows a Card as it was before.
 */
async function refetchCollection(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.cardLists,
      refetchType: 'all',
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.statistics,
      refetchType: 'all',
    }),
  ])
}

/**
 * Creates a Card. Nothing changes on screen until the backend agrees. A
 * retry of the same intended creation repeats its `idempotencyKey`.
 */
export function useCreateCard() {
  const queryClient = useQueryClient()
  const api = useApi()
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: CardInput
      idempotencyKey: string
    }) => api.createCard(input, idempotencyKey),
    onSuccess: (card) => afterWrite(queryClient, card),
  })
}

/** Edits a Card. Nothing changes on screen until the backend agrees. */
export function useUpdateCard() {
  const queryClient = useQueryClient()
  const api = useApi()
  return useMutation({
    mutationFn: ({ cardId, patch }: { cardId: string; patch: CardPatch }) =>
      api.updateCard(cardId, patch),
    onSuccess: (card) => afterWrite(queryClient, card),
  })
}

/**
 * Sets a Card's Progress: one more for "I Know This", 0 to reset. The value
 * is absolute, so retrying a failed save never credits twice. Nothing
 * changes on screen until the backend agrees and the listings and
 * statistics have refetched.
 */
export function useSetProgress() {
  const queryClient = useQueryClient()
  const api = useApi()
  return useMutation({
    mutationFn: ({ cardId, progress }: { cardId: string; progress: number }) =>
      api.setCardProgress(cardId, progress),
    onSuccess: (card) => afterWrite(queryClient, card),
  })
}

/** Whether a failed write found no such Card: it was already deleted. */
export const isNotFound = (error: unknown) =>
  error instanceof ApiError && error.status === 404

/**
 * Deletes a Card. Nothing changes on screen until the backend agrees: the
 * mutation stays pending until the listings and counts have refetched. A
 * Card the backend no longer has (404) is gone either way, so that also
 * refetches, to drop it from the screen.
 */
export function useDeleteCard() {
  const queryClient = useQueryClient()
  const api = useApi()
  const forget = async (cardId: string) => {
    queryClient.removeQueries({ queryKey: queryKeys.card(cardId) })
    await refetchCollection(queryClient)
  }
  return useMutation({
    mutationFn: (cardId: string) => api.deleteCard(cardId),
    onSuccess: (_, cardId) => forget(cardId),
    onError: async (error, cardId) => {
      if (isNotFound(error)) await forget(cardId)
    },
  })
}
