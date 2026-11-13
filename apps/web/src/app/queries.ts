import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api, ApiError } from '../api/client.js'
import type { Card, CardInput, CardPatch } from '../api/types.js'

/** How many Cards each request asks for: the first view and each Load More. */
export const PAGE_SIZE = 12

/** What the All Cards view is asking the backend for. */
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
}

/** The matching Cards, a page of 12 at a time, paged by the backend. */
export function useCardPages({ categoryIds, hideMastered, seed }: CardFilters) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.cardLists, { categoryIds, hideMastered, seed }],
    queryFn: ({ pageParam, signal }) =>
      api.listCards(
        {
          category: categoryIds.length > 0 ? [...categoryIds] : undefined,
          hideMastered: hideMastered || undefined,
          offset: pageParam,
          limit: PAGE_SIZE,
          seed,
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

/** Every Category with its global Card count. */
export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => api.listCategories(signal),
  })
}

/** Fetches one Card, fresh from the backend. */
export const fetchCard = (queryClient: QueryClient, cardId: string) =>
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

/** Refetches every Card listing and the global Category counts. */
async function refetchCollection(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
    queryClient.invalidateQueries({ queryKey: queryKeys.cardLists }),
  ])
}

/** Creates a Card. Nothing changes on screen until the backend agrees. */
export function useCreateCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CardInput) => api.createCard(input),
    onSuccess: (card) => afterWrite(queryClient, card),
  })
}

/** Edits a Card. Nothing changes on screen until the backend agrees. */
export function useUpdateCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ cardId, patch }: { cardId: string; patch: CardPatch }) =>
      api.updateCard(cardId, patch),
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
