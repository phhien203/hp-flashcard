import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, screen, waitFor } from 'storybook/test'

import { CategoryFilter } from './category-filter.js'

const meta = {
  title: 'Components/CategoryFilter',
  component: CategoryFilter,
  tags: ['autodocs'],
  args: {
    categories: [
      { name: 'Biology', count: 12 },
      { name: 'Chemistry', count: 8 },
      { name: 'Geography', count: 5 },
      { name: 'History', count: 15 },
      { name: 'Physics', count: 3 },
    ],
    onValueChange: fn(),
  },
  // Room under the trigger for the open menu.
  decorators: [
    (Story) => (
      <div className="pb-1800">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CategoryFilter>

export default meta
type Story = StoryObj<typeof meta>

/** Closed: the outline "All Categories" button with the angle-down icon. */
export const Closed: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: 'All Categories' })
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger.querySelector('svg')).toBeVisible()
  },
}

/** Open with nothing ticked: a checkbox and a count per category. */
export const Open: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'All Categories' })
    await userEvent.click(trigger)

    await expect(await screen.findByRole('menu')).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const items = screen.getAllByRole('menuitemcheckbox')
    await expect(items).toHaveLength(5)
    for (const item of items) {
      await expect(item).toHaveAttribute('aria-checked', 'false')
    }
    await expect(
      screen.getByRole('menuitemcheckbox', { name: 'Biology (12)' }),
    ).toBeVisible()
  },
}

/** Open with categories ticked from `defaultValue`. */
export const Selected: Story = {
  args: { defaultValue: ['Biology', 'History'] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'All Categories' }),
    )

    await expect(
      await screen.findByRole('menuitemcheckbox', { name: 'Biology (12)' }),
    ).toHaveAttribute('aria-checked', 'true')
    await expect(
      screen.getByRole('menuitemcheckbox', { name: 'History (15)' }),
    ).toHaveAttribute('aria-checked', 'true')
    await expect(
      screen.getByRole('menuitemcheckbox', { name: 'Chemistry (8)' }),
    ).toHaveAttribute('aria-checked', 'false')
  },
}

/** Several categories ticked in one go: the menu stays open between them. */
export const MultiSelect: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'All Categories' }),
    )

    await userEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Chemistry (8)' }),
    )
    await expect(args.onValueChange).toHaveBeenLastCalledWith(['Chemistry'])
    await expect(screen.getByRole('menu')).toBeVisible()

    await userEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Physics (3)' }),
    )
    await expect(args.onValueChange).toHaveBeenLastCalledWith([
      'Chemistry',
      'Physics',
    ])
    await expect(screen.getByRole('menu')).toBeVisible()
  },
}

/** Opened, ticked and closed from the keyboard alone. */
export const Keyboard: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'All Categories' })
    await userEvent.tab()
    await expect(trigger).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    const biology = await screen.findByRole('menuitemcheckbox', {
      name: 'Biology (12)',
    })
    await waitFor(() => expect(biology).toHaveFocus())
    await userEvent.keyboard(' ')
    await expect(biology).toHaveAttribute('aria-checked', 'true')
    await expect(args.onValueChange).toHaveBeenLastCalledWith(['Biology'])

    await userEvent.keyboard('{Escape}')
    // Let the menu finish closing: axe flags its focus guards mid-exit.
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await expect(trigger).toHaveFocus()
  },
}

/** The selection owned by the consumer through `value` and `onValueChange`. */
export const Controlled: Story = {
  render: function Render(args) {
    const [value, setValue] = useState<string[]>(['Geography'])
    return (
      <div className="flex flex-col items-start gap-200">
        <CategoryFilter
          {...args}
          value={value}
          onValueChange={(next) => {
            setValue(next)
            args.onValueChange?.(next)
          }}
        />
        <p className="text-preset-5-regular">
          Showing: {value.length ? value.join(', ') : 'all categories'}
        </p>
      </div>
    )
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText('Showing: Geography')).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'All Categories' }),
    )

    await userEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Geography (5)' }),
    )

    await expect(canvas.getByText('Showing: all categories')).toBeVisible()
    await expect(
      screen.getByRole('menuitemcheckbox', { name: 'Geography (5)' }),
    ).toHaveAttribute('aria-checked', 'false')
  },
}
