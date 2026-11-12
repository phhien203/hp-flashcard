import { useState } from 'react'

import { IconAngleDown } from '../icons/icon-angle-down.js'
import { Button } from './button.js'
import { Menu, MenuCheckboxItem, MenuContent, MenuTrigger } from './menu.js'

/** A category offered by the filter, with how many cards it holds. */
interface CategoryFilterCategory {
  /** The category's name. It is also the value reported when ticked. */
  name: string
  /** How many cards are in the category, shown next to the name. */
  count: number
}

interface CategoryFilterProps {
  /** The categories to offer, in the order they are listed. */
  categories: readonly CategoryFilterCategory[]
  /** The names of the ticked categories, when the consumer owns the state. */
  value?: readonly string[]
  /** The names ticked at first, when the filter owns the state. */
  defaultValue?: readonly string[]
  /**
   * Called with the new list of ticked names each time a category is ticked
   * or unticked. A ticked name is added at the end; an unticked one is
   * removed.
   */
  onValueChange?: (value: string[]) => void
  /** Classes for the trigger button. */
  className?: string
}

const NO_SELECTION: readonly string[] = []

/**
 * The "All Categories" dropdown: an outline button that opens a menu with a
 * checkbox item per category, its card count shown after the name. Ticking
 * items keeps the menu open, so several can be picked in one go.
 *
 * Pass `value` and `onValueChange` to control the selection, or
 * `defaultValue` to let the filter keep it.
 */
function CategoryFilter({
  categories,
  value,
  defaultValue = NO_SELECTION,
  onValueChange,
  className,
}: CategoryFilterProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const selected = value ?? uncontrolled

  const toggle = (name: string, checked: boolean) => {
    const others = selected.filter((n) => n !== name)
    const next = checked ? [...others, name] : others
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
  }

  return (
    <Menu>
      <MenuTrigger
        data-slot="category-filter"
        render={
          <Button
            variant="outline"
            className={className}
            trailingIcon={<IconAngleDown />}
          >
            All Categories
          </Button>
        }
      />
      <MenuContent>
        {categories.map(({ name, count }) => (
          <MenuCheckboxItem
            key={name}
            checked={selected.includes(name)}
            onCheckedChange={(checked) => toggle(name, checked)}
          >
            <span>
              {name} <span className="text-muted-foreground">({count})</span>
            </span>
          </MenuCheckboxItem>
        ))}
      </MenuContent>
    </Menu>
  )
}

export { CategoryFilter, type CategoryFilterCategory, type CategoryFilterProps }
