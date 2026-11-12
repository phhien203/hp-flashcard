import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'

import { createIcon } from '../icons/create-icon.js'
import { Button } from './button.js'
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuTrigger,
  type MenuProps,
} from './menu.js'

// Story-only icons: the app supplies its own.
const IconKebab = createIcon(
  'IconKebab',
  '0 0 16 16',
  <>
    <circle cx="8" cy="3" r="1.5" />
    <circle cx="8" cy="8" r="1.5" />
    <circle cx="8" cy="13" r="1.5" />
  </>,
)
const IconEdit = createIcon(
  'IconEdit',
  '0 0 16 16',
  <path d="M11.3 1.3a1 1 0 0 1 1.4 0l2 2a1 1 0 0 1 0 1.4L5.4 14H2v-3.4zM3.5 11.6v.9h.9l7-7-.9-.9z" />,
)
const IconDelete = createIcon(
  'IconDelete',
  '0 0 16 16',
  <path d="M6 1h4l.5 1H14v1.5H2V2h3.5zM3 5h10l-.8 9.1a1 1 0 0 1-1 .9H4.8a1 1 0 0 1-1-.9zm1.6 1.5.6 7h5.6l.6-7z" />,
)

const CATEGORIES = ['Biology', 'Chemistry', 'History', 'Physics'] as const

/** Menu's props, plus the kebab item callbacks the stories spy on. */
type MenuStoryArgs = MenuProps & {
  onEdit: () => void
  onDelete: () => void
}

const meta: Meta<MenuStoryArgs> = {
  title: 'Components/Menu',
  tags: ['autodocs'],
  args: {
    onOpenChange: fn(),
    onEdit: fn(),
    onDelete: fn(),
  },
}

export default meta
type Story = StoryObj<MenuStoryArgs>

/** The card's actions: an icon-size kebab trigger and items with icons. */
export const Kebab: Story = {
  render: ({ onOpenChange, onEdit, onDelete }) => (
    <Menu onOpenChange={onOpenChange}>
      <MenuTrigger
        render={
          <Button size="icon" variant="secondary" aria-label="Card actions">
            <IconKebab />
          </Button>
        }
      />
      <MenuContent>
        <MenuItem icon={<IconEdit />} onClick={onEdit}>
          Edit
        </MenuItem>
        <MenuItem icon={<IconDelete />} onClick={onDelete}>
          Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  ),
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Card actions' })
    await userEvent.click(trigger)

    const edit = await screen.findByRole('menuitem', { name: 'Edit' })
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(edit)

    await expect(args.onEdit).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  },
}

/** The category filter: checkbox items that keep the menu open. */
export const Checkboxes: Story = {
  render: ({ onOpenChange }) => (
    <Menu onOpenChange={onOpenChange}>
      <MenuTrigger render={<Button variant="outline">All Categories</Button>} />
      <MenuContent>
        {CATEGORIES.map((category) => (
          <MenuCheckboxItem
            key={category}
            defaultChecked={category === 'History'}
          >
            {category}
          </MenuCheckboxItem>
        ))}
      </MenuContent>
    </Menu>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'All Categories' }),
    )

    const biology = await screen.findByRole('menuitemcheckbox', {
      name: 'Biology',
    })
    await expect(biology).toHaveAttribute('aria-checked', 'false')
    await expect(
      screen.getByRole('menuitemcheckbox', { name: 'History' }),
    ).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(biology)

    await expect(biology).toHaveAttribute('aria-checked', 'true')
    await expect(screen.getByRole('menu')).toBeVisible()
  },
}

/** Opened, moved through and closed from the keyboard alone. */
export const Keyboard: Story = {
  ...Kebab,
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Card actions' })
    await userEvent.tab()
    await expect(trigger).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    const edit = await screen.findByRole('menuitem', { name: 'Edit' })
    await waitFor(() => expect(edit).toHaveFocus())

    await userEvent.keyboard('{ArrowDown}')
    await expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await expect(trigger).toHaveFocus()
    await expect(args.onDelete).not.toHaveBeenCalled()
  },
}

/**
 * Both item kinds at rest, highlighted and disabled, in a static open list.
 * The highlighted rows copy the class `menu.tsx` applies on
 * `data-highlighted:`; keep them in sync. The tests check the real one.
 */
export const States: Story = {
  render: () => (
    <div className="pb-1800">
      <Menu open>
        <MenuTrigger render={<Button variant="outline">States</Button>} />
        <MenuContent>
          <MenuItem icon={<IconEdit />}>Rest</MenuItem>
          <MenuItem icon={<IconEdit />} className="bg-background">
            Highlighted
          </MenuItem>
          <MenuItem icon={<IconDelete />} disabled>
            Disabled
          </MenuItem>
          <MenuCheckboxItem>Unchecked</MenuCheckboxItem>
          <MenuCheckboxItem defaultChecked>Checked</MenuCheckboxItem>
          <MenuCheckboxItem defaultChecked className="bg-background">
            Checked highlighted
          </MenuCheckboxItem>
          <MenuCheckboxItem disabled>Disabled</MenuCheckboxItem>
        </MenuContent>
      </Menu>
    </div>
  ),
  play: async () => {
    await expect(await screen.findByRole('menu')).toBeVisible()
  },
}
