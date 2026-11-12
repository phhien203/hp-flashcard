import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

// Import from the public barrel so a missing export fails the test.
import {
  CategoryFilter,
  type CategoryFilterCategory,
  type CategoryFilterProps,
} from '../../index.js'

const categories: CategoryFilterCategory[] = [
  { name: 'Biology', count: 12 },
  { name: 'Chemistry', count: 8 },
  { name: 'History', count: 15 },
]

const renderFilter = (props: Partial<CategoryFilterProps> = {}) =>
  render(<CategoryFilter categories={categories} {...props} />)

const trigger = () => page.getByRole('button', { name: 'All Categories' })
const menu = () => page.getByRole('menu')
const item = (name: string) => page.getByRole('menuitemcheckbox', { name })

async function open() {
  await trigger().click()
  await expect.element(menu()).toBeVisible()
}

// A menu still closing makes the next test's pointer park time out in
// Firefox and WebKit, so close it and wait for it to unmount.
afterEach(async () => {
  if (menu().query()) {
    await userEvent.keyboard('{Escape}')
    await expect.element(menu()).not.toBeInTheDocument()
  }
})

describe('CategoryFilter', () => {
  it('is a collapsed "All Categories" button until clicked', async () => {
    await renderFilter()

    await expect.element(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(menu().query()).toBeNull()

    await open()
    await expect.element(trigger()).toHaveAttribute('aria-expanded', 'true')
  })

  it('draws the trigger as an outline Button with a decorative angle-down icon', async () => {
    await renderFilter()

    const button = trigger().element()
    const icon = button.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    const style = getComputedStyle(button)
    expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(style.borderTopWidth).toBe('1px')
  })

  it('lists a checkbox item per category, named with its count', async () => {
    await renderFilter()
    await open()

    await expect.element(item('Biology (12)')).toBeVisible()
    await expect.element(item('Chemistry (8)')).toBeVisible()
    await expect.element(item('History (15)')).toBeVisible()
    expect(page.getByRole('menuitemcheckbox').all()).toHaveLength(3)
  })

  it('shows the count in muted-foreground and the name in the popover color', async () => {
    await render(
      <>
        <CategoryFilter categories={categories} />
        <span data-testid="muted" className="text-muted-foreground" />
      </>,
    )
    const muted = getComputedStyle(page.getByTestId('muted').element()).color
    await open()

    const count = page.getByText('(12)').element()
    expect(getComputedStyle(count).color).toBe(muted)
    expect(getComputedStyle(item('Biology (12)').element()).color).not.toBe(
      muted,
    )
  })

  it('keeps the menu open while several categories are ticked', async () => {
    const onValueChange = vi.fn()
    await renderFilter({ onValueChange })
    await open()

    await item('Biology (12)').click()
    await expect.element(menu()).toBeVisible()
    await item('History (15)').click()

    await expect.element(menu()).toBeVisible()
    await expect
      .element(item('Biology (12)'))
      .toHaveAttribute('aria-checked', 'true')
    await expect
      .element(item('History (15)'))
      .toHaveAttribute('aria-checked', 'true')
    expect(onValueChange).toHaveBeenNthCalledWith(1, ['Biology'])
    expect(onValueChange).toHaveBeenNthCalledWith(2, ['Biology', 'History'])
  })

  it('removes a category when it is unticked', async () => {
    const onValueChange = vi.fn()
    await renderFilter({ defaultValue: ['Biology', 'History'], onValueChange })
    await open()

    await item('Biology (12)').click()

    await expect
      .element(item('Biology (12)'))
      .toHaveAttribute('aria-checked', 'false')
    expect(onValueChange).toHaveBeenLastCalledWith(['History'])
  })

  it('starts with the defaultValue categories ticked', async () => {
    await renderFilter({ defaultValue: ['Chemistry'] })
    await open()

    await expect
      .element(item('Chemistry (8)'))
      .toHaveAttribute('aria-checked', 'true')
    await expect
      .element(item('Biology (12)'))
      .toHaveAttribute('aria-checked', 'false')
  })

  it('follows value and leaves the selection to the consumer', async () => {
    const onValueChange = vi.fn()
    await renderFilter({ value: ['History'], onValueChange })
    await open()

    await item('Biology (12)').click()

    expect(onValueChange).toHaveBeenLastCalledWith(['History', 'Biology'])
    // Not re-rendered with the new value, so nothing changes.
    await expect
      .element(item('Biology (12)'))
      .toHaveAttribute('aria-checked', 'false')
    await expect
      .element(item('History (15)'))
      .toHaveAttribute('aria-checked', 'true')
  })

  it('works with state owned by the consumer', async () => {
    function Controlled() {
      const [value, setValue] = useState<string[]>([])
      return (
        <>
          <CategoryFilter
            categories={categories}
            value={value}
            onValueChange={setValue}
          />
          <p>Showing: {value.join(', ') || 'all'}</p>
        </>
      )
    }
    await render(<Controlled />)
    await open()

    await item('Chemistry (8)').click()

    await expect.element(page.getByText('Showing: Chemistry')).toBeVisible()
    await expect
      .element(item('Chemistry (8)'))
      .toHaveAttribute('aria-checked', 'true')
  })

  it('opens, ticks and closes from the keyboard', async () => {
    const onValueChange = vi.fn()
    await renderFilter({ onValueChange })
    await userEvent.tab()
    await expect.element(trigger()).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    await expect.element(item('Biology (12)')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await expect.element(item('Chemistry (8)')).toHaveFocus()
    await userEvent.keyboard(' ')
    await expect
      .element(item('Chemistry (8)'))
      .toHaveAttribute('aria-checked', 'true')
    expect(onValueChange).toHaveBeenLastCalledWith(['Chemistry'])
    await expect.element(menu()).toBeVisible()

    await userEvent.keyboard('{Escape}')
    await expect.element(menu()).not.toBeInTheDocument()
    await expect.element(trigger()).toHaveFocus()
  })

  it('passes className to the trigger', async () => {
    await renderFilter({ className: 'w-full' })

    await expect.element(trigger()).toHaveClass('w-full')
  })
})
