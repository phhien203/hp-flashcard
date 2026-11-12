import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn } from 'storybook/test'

import { settle } from '../../test/settle.js'
import { Flashcard } from './flashcard.js'

/** A CSS color as the browser resolves it, for comparing with styles. */
const resolved = (css: string) => {
  const probe = document.createElement('div')
  probe.style.color = css
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

const face = (root: HTMLElement, side: 'front' | 'back') =>
  root.querySelector<HTMLElement>(`[data-slot="flashcard-${side}"]`)!

const meta = {
  title: 'Components/Flashcard',
  component: Flashcard,
  tags: ['autodocs'],
  args: {
    question: 'What is the capital of France?',
    answer: 'Paris',
    category: 'Geography',
    progress: 0,
    onFlippedChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-page">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Flashcard>

export default meta
type Story = StoryObj<typeof meta>

/** Figma "Study Mode": the pink question side. */
export const Question: Story = {
  play: async ({ canvas, canvasElement }) => {
    // A plain button, not a toggle: its name says what it does next.
    const button = canvas.getByRole('button', { name: 'Show answer' })
    await expect(button).not.toHaveAttribute('aria-pressed')
    await expect(canvas.getByText('Click to reveal answer')).toBeVisible()
    await expect(canvas.queryByText('Paris')).toBeNull()
    await expect(
      getComputedStyle(face(canvasElement, 'front')).backgroundColor,
    ).toBe(resolved('var(--pink-400)'))
  },
}

/** Figma "Card Answer": the blue answer side. */
export const Answer: Story = {
  args: { defaultFlipped: true, progress: 2 },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole('button', { name: 'Show question' }),
    ).toBeInTheDocument()
    await expect(canvas.getByText('Answer:')).toBeVisible()
    await expect(canvas.getByText('Paris')).toBeVisible()
    await expect(
      getComputedStyle(face(canvasElement, 'back')).backgroundColor,
    ).toBe(resolved('var(--blue-400)'))
  },
}

/** A long question wraps, and the card grows to fit it. */
export const LongQuestion: Story = {
  args: {
    question:
      'Which river flows through Paris before reaching the English Channel at Le Havre?',
    answer: 'The Seine',
    progress: 4,
  },
  play: async ({ args, canvas }) => {
    const question = canvas.getByText(String(args.question))
    await expect(question).toBeVisible()

    // The card grows with the question, so the flip button still covers it.
    const text = question.getBoundingClientRect()
    const button = canvas
      .getByRole('button', { name: 'Show answer' })
      .getBoundingClientRect()
    await expect(text.top).toBeGreaterThanOrEqual(button.top)
    await expect(text.bottom).toBeLessThanOrEqual(button.bottom)
  },
}

/** A click turns the card over to the answer, and back. */
export const FlipOnClick: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show answer' }))

    const button = canvas.getByRole('button', { name: 'Show question' })
    await expect(canvas.getByText('Paris')).toBeVisible()
    await expect(args.onFlippedChange).toHaveBeenLastCalledWith(true)

    const inner = canvasElement.querySelector('[data-slot="flashcard-inner"]')!
    await settle(inner)

    await userEvent.click(button)
    await expect(
      canvas.getByRole('button', { name: 'Show answer' }),
    ).toBeInTheDocument()
    await expect(args.onFlippedChange).toHaveBeenLastCalledWith(false)
  },
}

/** Enter and Space flip the focused card. */
export const Keyboard: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab()
    const button = canvas.getByRole('button')
    await expect(button).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    await expect(button).toHaveAccessibleName('Show question')

    await userEvent.keyboard(' ')
    await expect(button).toHaveAccessibleName('Show answer')
  },
}

function ControlledDemo() {
  const [flipped, setFlipped] = useState(false)
  return (
    <div className="flex flex-col items-start gap-200">
      <Flashcard
        question="What is the capital of Japan?"
        answer="Tokyo"
        category="Geography"
        progress={3}
        flipped={flipped}
        onFlippedChange={setFlipped}
      />
      <p className="text-preset-5-regular">
        The app says: {flipped ? 'answer side' : 'question side'}
      </p>
    </div>
  )
}

/** The app owns `flipped` and updates it from `onFlippedChange`. */
export const Controlled: Story = {
  render: () => <ControlledDemo />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show answer' }))

    await expect(canvas.getByText('The app says: answer side')).toBeVisible()
    await expect(canvas.getByText('Tokyo')).toBeVisible()
  },
}
