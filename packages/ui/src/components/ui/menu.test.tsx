import { useState } from 'react'
import { page, userEvent } from 'vitest/browser'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'

// Import from the public barrel so a missing export fails the test.
import {
  Button,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuTrigger,
  type MenuCheckboxItemProps,
  type MenuItemProps,
} from '../../index.js'

function Actions({
  onEdit,
  onDelete,
  deleteProps,
}: {
  onEdit?: () => void
  onDelete?: () => void
  deleteProps?: Partial<MenuItemProps>
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button size="icon" aria-label="Card actions">
            ⋮
          </Button>
        }
      />
      <MenuContent>
        <MenuItem icon={<svg data-testid="edit-icon" />} onClick={onEdit}>
          Edit
        </MenuItem>
        <MenuItem onClick={onDelete} {...deleteProps}>
          Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function Filter(props: Partial<MenuCheckboxItemProps>) {
  return (
    <Menu>
      <MenuTrigger>Categories</MenuTrigger>
      <MenuContent>
        <MenuCheckboxItem {...props}>Biology</MenuCheckboxItem>
        <MenuCheckboxItem>History</MenuCheckboxItem>
      </MenuContent>
    </Menu>
  )
}

const trigger = () => page.getByRole('button', { name: 'Card actions' })
const menu = () => page.getByRole('menu')
const item = (name: string) => page.getByRole('menuitem', { name })
const checkboxItem = (name: string) =>
  page.getByRole('menuitemcheckbox', { name })

async function focusTrigger() {
  await userEvent.tab()
  await expect.element(trigger()).toHaveFocus()
}

describe('Menu', () => {
  it('is a collapsed button until clicked, then a menu of items', async () => {
    await render(<Actions />)

    await expect.element(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(menu().query()).toBeNull()

    await trigger().click()

    await expect.element(menu()).toBeVisible()
    await expect.element(trigger()).toHaveAttribute('aria-expanded', 'true')
    await expect.element(item('Edit')).toBeVisible()
    await expect.element(item('Delete')).toBeVisible()
  })

  it('renders the leading icon inside the item', async () => {
    await render(<Actions />)
    await trigger().click()

    const icon = page.getByTestId('edit-icon')
    await expect.element(icon).toBeVisible()
    expect(item('Edit').element().contains(icon.element())).toBe(true)
  })

  it('calls the item handler and closes on click', async () => {
    const onEdit = vi.fn()
    await render(<Actions onEdit={onEdit} />)

    await trigger().click()
    await item('Edit').click()

    expect(onEdit).toHaveBeenCalledOnce()
    await expect.element(menu()).not.toBeInTheDocument()
  })

  it.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
    ['ArrowDown', '{ArrowDown}'],
  ])('opens with %s and focuses the first item', async (_, key) => {
    await render(<Actions />)
    await focusTrigger()

    await userEvent.keyboard(key)

    await expect.element(menu()).toBeVisible()
    await expect.element(item('Edit')).toHaveFocus()
  })

  it('moves with the arrow keys', async () => {
    await render(<Actions />)
    await focusTrigger()
    await userEvent.keyboard('{Enter}')
    await expect.element(item('Edit')).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    await expect.element(item('Delete')).toHaveFocus()

    await userEvent.keyboard('{ArrowUp}')
    await expect.element(item('Edit')).toHaveFocus()
  })

  it.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
  ])('selects the focused item with %s', async (_, key) => {
    const onDelete = vi.fn()
    await render(<Actions onDelete={onDelete} />)
    await focusTrigger()
    await userEvent.keyboard('{Enter}')
    await expect.element(item('Edit')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await expect.element(item('Delete')).toHaveFocus()

    await userEvent.keyboard(key)

    expect(onDelete).toHaveBeenCalledOnce()
    await expect.element(menu()).not.toBeInTheDocument()
  })

  it('closes with Escape and returns focus to the trigger', async () => {
    await render(<Actions />)
    await focusTrigger()
    await userEvent.keyboard('{Enter}')
    await expect.element(item('Edit')).toHaveFocus()

    await userEvent.keyboard('{Escape}')

    await expect.element(menu()).not.toBeInTheDocument()
    await expect.element(trigger()).toHaveFocus()
    await expect.element(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('skips and ignores a disabled item', async () => {
    const onDelete = vi.fn()
    await render(
      <Actions onDelete={onDelete} deleteProps={{ disabled: true }} />,
    )
    await trigger().click()

    await expect
      .element(item('Delete'))
      .toHaveAttribute('aria-disabled', 'true')
    await item('Delete').click({ force: true })

    expect(onDelete).not.toHaveBeenCalled()
  })

  it('highlights the item under the pointer', async () => {
    await render(<Actions />)
    await trigger().click()
    await expect.element(menu()).toBeVisible()
    const edit = item('Edit')
    const background = () => getComputedStyle(edit.element()).backgroundColor
    const rest = background()

    await edit.hover()

    await expect.poll(background).not.toBe(rest)
  })

  it('draws a bordered popup with the 8px radius and hard shadow', async () => {
    await render(<Actions />)
    await trigger().click()
    await expect.element(menu()).toBeVisible()

    const style = getComputedStyle(menu().element())
    expect(style.borderTopLeftRadius).toBe('8px')
    expect(style.borderTopWidth).toBe('1px')
    expect(style.boxShadow).toMatch(/2px 2px 0px 0px/)
  })
})

describe('MenuCheckboxItem', () => {
  it('toggles on click and keeps the menu open', async () => {
    const onCheckedChange = vi.fn()
    await render(<Filter onCheckedChange={onCheckedChange} />)
    await page.getByRole('button', { name: 'Categories' }).click()

    const biology = checkboxItem('Biology')
    await expect.element(biology).toHaveAttribute('aria-checked', 'false')

    await biology.click()

    await expect.element(biology).toHaveAttribute('aria-checked', 'true')
    expect(onCheckedChange).toHaveBeenLastCalledWith(true, expect.anything())
    await expect.element(menu()).toBeVisible()

    await biology.click()
    await expect.element(biology).toHaveAttribute('aria-checked', 'false')
    expect(onCheckedChange).toHaveBeenLastCalledWith(false, expect.anything())
  })

  it('toggles with Space and Enter from the keyboard and stays open', async () => {
    await render(<Filter />)
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    const biology = checkboxItem('Biology')
    await expect.element(biology).toHaveFocus()

    await userEvent.keyboard(' ')
    await expect.element(biology).toHaveAttribute('aria-checked', 'true')

    await userEvent.keyboard('{Enter}')
    await expect.element(biology).toHaveAttribute('aria-checked', 'false')
    await expect.element(menu()).toBeVisible()
  })

  it('starts checked with defaultChecked', async () => {
    await render(<Filter defaultChecked />)
    await page.getByRole('button', { name: 'Categories' }).click()

    await expect
      .element(checkboxItem('Biology'))
      .toHaveAttribute('aria-checked', 'true')
  })

  it('works with state owned by the consumer', async () => {
    function Controlled() {
      const [checked, setChecked] = useState(false)
      return (
        <>
          <Filter checked={checked} onCheckedChange={setChecked} />
          <p>{checked ? 'filtered' : 'all'}</p>
        </>
      )
    }
    await render(<Controlled />)
    await page.getByRole('button', { name: 'Categories' }).click()

    await checkboxItem('Biology').click()

    await expect.element(page.getByText('filtered')).toBeInTheDocument()
    await expect
      .element(checkboxItem('Biology'))
      .toHaveAttribute('aria-checked', 'true')
  })

  it('fills its box with the primary color only when checked', async () => {
    await render(
      <>
        <Filter />
        <span data-testid="primary" className="bg-primary" />
      </>,
    )
    const primary = getComputedStyle(
      page.getByTestId('primary').element(),
    ).backgroundColor
    await page.getByRole('button', { name: 'Categories' }).click()
    const biology = checkboxItem('Biology')
    await expect.element(biology).toBeVisible()
    const box = () => biology.element().querySelector('span')!

    expect(getComputedStyle(box()).backgroundColor).not.toBe(primary)
    expect(getComputedStyle(box()).width).toBe('16px')

    await biology.click()

    await expect
      .poll(() => getComputedStyle(box()).backgroundColor)
      .toBe(primary)
  })
})
