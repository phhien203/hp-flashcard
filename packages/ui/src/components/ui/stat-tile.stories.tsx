import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { IconCheck } from '../icons/icon-check.js'
import { IconClose } from '../icons/icon-close.js'
import { IconEdit } from '../icons/icon-edit.js'
import { IconKebab } from '../icons/icon-kebab.js'
import { StatTile } from './stat-tile.js'

// The Figma tiles use dedicated statistics icons that the package doesn't
// ship yet; these stories stand in the shipped ones.
const meta = {
  title: 'Components/StatTile',
  component: StatTile,
  tags: ['autodocs'],
  args: {
    label: 'Total Cards',
    value: 40,
    icon: <IconKebab />,
    accent: 'blue-400',
    className: 'max-w-dialog',
  },
} satisfies Meta<typeof StatTile>

export default meta
type Story = StoryObj<typeof meta>

/** One tile: the label names a group holding the number. */
export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    const tile = canvas.getByRole('group', { name: 'Total Cards' })
    await expect(tile).toBeVisible()
    await expect(tile).toHaveTextContent('40')
    // The icon panel is decorative.
    await expect(
      canvasElement.querySelector('svg')?.closest('[aria-hidden="true"]'),
    ).not.toBeNull()
  },
}

const tiles = [
  { label: 'Total Cards', value: 40, accent: 'blue-400', icon: <IconKebab /> },
  { label: 'Mastered', value: 11, accent: 'teal-400', icon: <IconCheck /> },
  { label: 'In Progress', value: 21, accent: 'pink-500', icon: <IconEdit /> },
  { label: 'Not Started', value: 8, accent: 'pink-400', icon: <IconClose /> },
] as const

/** The four Study Statistics tiles from Figma. */
export const StudyStatistics: Story = {
  render: () => (
    <div className="grid w-full max-w-page gap-300 sm:grid-cols-2">
      {tiles.map((tile) => (
        <StatTile key={tile.label} {...tile} />
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('group')).toHaveLength(4)
    for (const { label, value } of tiles) {
      await expect(
        canvas.getByRole('group', { name: label }),
      ).toHaveTextContent(String(value))
    }
  },
}

/** A long label wraps inside the tile instead of pushing the panel out. */
export const LongLabel: Story = {
  args: {
    label:
      'Cards answered correctly at least once in every study session this week',
    value: 1234,
    accent: 'teal-400',
    icon: <IconCheck />,
  },
  play: async ({ args, canvas, canvasElement }) => {
    const tile = canvas.getByRole('group').getBoundingClientRect()
    const label = canvas.getByText(String(args.label)).getBoundingClientRect()
    const panel = canvasElement
      .querySelector('[aria-hidden="true"]')!
      .getBoundingClientRect()
    await expect(label.right).toBeLessThanOrEqual(panel.left)
    await expect(panel.right).toBeLessThanOrEqual(tile.right)
  },
}
