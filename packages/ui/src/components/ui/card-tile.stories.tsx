import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'

import { CardTile } from './card-tile.js'

const meta = {
  title: 'Components/CardTile',
  component: CardTile,
  tags: ['autodocs'],
  args: {
    question: 'What is the capital of France?',
    answer: 'Paris',
    category: 'Geography',
    progress: 0,
    onEdit: fn(),
    onDelete: fn(),
    // About one column of the All Cards grid.
    className: 'max-w-dialog',
  },
} satisfies Meta<typeof CardTile>

export default meta
type Story = StoryObj<typeof meta>

/** A card still being learned: the progress bar with its count. */
export const InProgress: Story = {
  args: { progress: 2 },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('article', { name: 'What is the capital of France?' }),
    ).toBeVisible()
    await expect(canvas.getByText('Answer:')).toBeVisible()
    await expect(canvas.getByText('Geography')).toBeVisible()
    await expect(canvas.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '2',
    )
    await expect(canvas.getByText('2/5')).toBeVisible()
  },
}

/** A card answered correctly 5 times: the Mastered badge replaces the bar. */
export const Mastered: Story = {
  args: { progress: 5 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Mastered 5/5')).toBeVisible()
    await expect(canvas.queryByRole('progressbar')).toBeNull()
  },
}

/** Long questions and answers wrap, and the tile grows to fit them. */
export const LongText: Story = {
  args: {
    question:
      'Which river flows through Paris before reaching the English Channel at Le Havre?',
    answer:
      'The Seine, which rises at Source-Seine on the Langres plateau and runs about 777 kilometres to the sea.',
    category: 'Geography',
    progress: 3,
  },
  play: async ({ args, canvas }) => {
    const tile = canvas.getByRole('article').getBoundingClientRect()
    for (const text of [args.question, args.answer]) {
      const box = canvas.getByText(String(text)).getBoundingClientRect()
      await expect(box.right).toBeLessThanOrEqual(tile.right)
      await expect(box.bottom).toBeLessThanOrEqual(tile.bottom)
    }
  },
}

/** The kebab menu offers Edit and Delete, which call `onEdit` and `onDelete`. */
export const Actions: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Card actions' })

    await userEvent.click(trigger)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    await expect(args.onEdit).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    await userEvent.click(trigger)
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete' }),
    )
    await expect(args.onDelete).toHaveBeenCalledOnce()
  },
}

/** The menu opened and used from the keyboard alone. */
export const Keyboard: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Card actions' })
    await userEvent.tab()
    await expect(trigger).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    const edit = await screen.findByRole('menuitem', { name: 'Edit' })
    await waitFor(() => expect(edit).toHaveFocus())
    await userEvent.keyboard('{Enter}')

    await expect(args.onEdit).toHaveBeenCalledOnce()
    await waitFor(() => expect(trigger).toHaveFocus())
  },
}

/** Tiles in the All Cards grid. */
export const Grid: Story = {
  render: (args) => (
    <div className="grid w-full max-w-page gap-300 sm:grid-cols-2 lg:grid-cols-3">
      <CardTile {...args} progress={0} />
      <CardTile
        {...args}
        question="What is H2O?"
        answer="Water"
        category="Chemistry"
        progress={3}
      />
      <CardTile
        {...args}
        question="Who painted the Mona Lisa?"
        answer="Leonardo da Vinci"
        category="Art"
        progress={5}
      />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('article')).toHaveLength(3)
    await expect(canvas.getByText('Mastered 5/5')).toBeVisible()
  },
}
