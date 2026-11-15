import { CategoryFilter, Checkbox } from '@hp-flashcard/ui'

import type { Category } from '../api/types.js'
import { idsOf, namesOf } from './category-selection.js'
import type { CardFilters } from './queries.js'

/** Every visit starts here: all Categories, Mastered shown, default order. */
export const INITIAL_FILTERS: CardFilters = {
  categoryIds: [],
  hideMastered: false,
  seed: undefined,
}

/** What the person changed: the chosen Categories, or Hide Mastered. */
export type FilterChange = Partial<
  Pick<CardFilters, 'categoryIds' | 'hideMastered'>
>

export interface CardFilterControlsProps {
  /** Every Category, or `undefined` while they load. */
  categories: readonly Category[] | undefined
  filters: CardFilters
  /** The page decides what else a change resets, such as the Shuffle. */
  onChange: (change: FilterChange) => void
}

/**
 * The Category filter and the Hide Mastered checkbox, shared by All Cards
 * and Study Mode. The page owns the filters; this only reports changes.
 */
export function CardFilterControls({
  categories,
  filters,
  onChange,
}: CardFilterControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-200">
      <CategoryFilter
        categories={categories ?? []}
        value={namesOf(categories, filters.categoryIds)}
        onValueChange={(names) =>
          onChange({ categoryIds: idsOf(categories, names) })
        }
      />
      <label className="flex cursor-pointer items-center gap-100 text-preset-4-medium">
        <Checkbox
          checked={filters.hideMastered}
          onCheckedChange={(hideMastered) => onChange({ hideMastered })}
        />
        Hide Mastered
      </label>
    </div>
  )
}
