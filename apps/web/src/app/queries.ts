import { QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query'

import { api } from '../api/client.js'

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

/** The matching Cards, a page of 12 at a time, paged by the backend. */
export function useCardPages({ categoryIds, hideMastered, seed }: CardFilters) {
  return useInfiniteQuery({
    queryKey: ['cards', 'list', { categoryIds, hideMastered, seed }],
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
    queryKey: ['categories'],
    queryFn: ({ signal }) => api.listCategories(signal),
  })
}
