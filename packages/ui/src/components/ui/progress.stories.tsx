import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Progress } from './progress.js'

const meta = {
  title: 'Components/Progress',
  component: Progress,
  tags: ['autodocs'],
  args: {
    'aria-label': 'Mastery',
    value: 2,
    showCount: true,
  },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 5, step: 1 } },
  },
} satisfies Meta<typeof Progress>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvas }) => {
    const bar = canvas.getByRole('progressbar', { name: 'Mastery' })
    await expect(bar).toHaveAttribute('aria-valuenow', '2')
    await expect(bar).toHaveAttribute('aria-valuemax', '5')
    await expect(bar).toHaveAttribute('aria-valuetext', '2 of 5')
    await expect(canvas.getByText('2/5')).toBeVisible()
  },
}

export const WithoutCount: Story = {
  args: { showCount: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('progressbar')).toBeVisible()
    await expect(canvas.queryByText('2/5')).toBeNull()
  },
}

/** Every mastery level the design shows, from 0 to 5. */
export const AllValues: Story = {
  render: (args) => (
    <div className="flex flex-col gap-200">
      {[0, 1, 2, 3, 4, 5].map((value) => (
        <Progress
          key={value}
          {...args}
          aria-label={`Mastery ${String(value)}`}
          value={value}
        />
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const bars = canvas.getAllByRole('progressbar')
    await expect(bars).toHaveLength(6)
    for (const [value, bar] of bars.entries()) {
      await expect(bar).toHaveAttribute('aria-valuenow', String(value))
      await expect(bar).toHaveTextContent(`${String(value)}/5`)
    }
  },
}
