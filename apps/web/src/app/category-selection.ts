import type { Category, CategoryList } from '../api/types.js'
import type { CardFilters } from './queries.js'

/**
 * Drops selected Categories that no longer exist (their last Card moved
 * away or was deleted); none left means every Category.
 */
export function withExistingCategories(
  filters: CardFilters,
  categories: CategoryList | undefined,
): CardFilters {
  if (!categories || filters.categoryIds.length === 0) return filters
  const existing = filters.categoryIds.filter((id) =>
    categories.items.some((c) => c.id === id),
  )
  return existing.length === filters.categoryIds.length
    ? filters
    : { ...filters, categoryIds: existing }
}

/** CategoryFilter speaks in names; the API in stable Category ids. */
export const namesOf = (
  categories: readonly Category[] | undefined,
  ids: readonly string[],
) => ids.flatMap((id) => categories?.find((c) => c.id === id)?.name ?? [])

export const idsOf = (
  categories: readonly Category[] | undefined,
  names: readonly string[],
) => names.flatMap((name) => categories?.find((c) => c.name === name)?.id ?? [])
