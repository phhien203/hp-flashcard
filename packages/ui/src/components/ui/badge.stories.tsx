import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { IconCheck } from '../icons/icon-check.js'
import { Badge } from './badge.js'

const meta = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
  args: { children: 'Geography' },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

/** A card's category tag. */
export const Outline: Story = {
  args: { variant: 'outline' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Geography')).toBeVisible()
  },
}

/** The "Mastered" pill, with an icon before the text. */
export const Mastered: Story = {
  args: {
    variant: 'mastered',
    icon: <IconCheck />,
    children: 'Mastered',
  },
  play: async ({ canvasElement, canvas }) => {
    await expect(canvas.getByText('Mastered')).toBeVisible()
    // The icon is decorative: hidden from assistive technology.
    await expect(canvasElement.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  },
}

export const Variants: Story = {
  render: () => (
    <div className="flex items-center gap-150">
      <Badge>Geography</Badge>
      <Badge variant="mastered" icon={<IconCheck />}>
        Mastered
      </Badge>
      <Badge variant="mastered">Mastered</Badge>
    </div>
  ),
}
