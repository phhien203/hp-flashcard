import { useState } from 'react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands, userEvent } from 'vitest/browser'

// Import from the public barrel so a missing export fails the test.
import { Flashcard, type FlashcardProps } from '../../index.js'
import '../../test/commands.js'
import { settle } from '../../test/settle.js'

const card = {
  question: 'What is the capital of France?',
  answer: 'Paris',
  category: 'Geography',
  progress: 2,
} satisfies FlashcardProps

const renderCard = (props: Partial<FlashcardProps> = {}) =>
  render(<Flashcard {...card} {...props} />)

/** The element that carries the 3D turn. */
const inner = (root: Element) =>
  root.querySelector('[data-slot="flashcard-inner"]')!

describe('Flashcard', () => {
  it('shows the question side as a plain "Show answer" button', async () => {
    const screen = await renderCard()

    const button = screen.getByRole('button', { name: 'Show answer' })
    // Not a toggle: the name changes with the side, so it carries no state.
    await expect.element(button).not.toHaveAttribute('aria-pressed')
    await expect.element(screen.getByText(card.question)).toBeVisible()
    await expect
      .element(screen.getByText('Click to reveal answer'))
      .toBeVisible()
  })

  it('leaves the question readable as text, outside the button', async () => {
    const screen = await renderCard()

    const question = screen.getByText(card.question).element()
    expect(question.closest('button')).toBeNull()
    expect(question.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('keeps the answer out of the DOM until the card is flipped', async () => {
    const screen = await renderCard()

    expect(screen.container.textContent).not.toContain(card.answer)
    expect(screen.container.textContent).not.toContain('Answer:')

    await screen.getByRole('button').click()

    await expect.element(screen.getByText(card.answer)).toBeVisible()
    await expect.element(screen.getByText('Answer:')).toBeVisible()
  })

  it('keeps the answer on the back while it turns away, then removes it', async () => {
    const screen = await renderCard()
    await screen.getByRole('button', { name: 'Show answer' }).click()
    await settle(inner(screen.container))

    await screen.getByRole('button', { name: 'Show question' }).click()
    // Mid-turn, the back still shows the answer rather than a blank face.
    expect(screen.container.textContent).toContain(card.answer)

    await settle(inner(screen.container))
    await expect
      .poll(() => screen.container.textContent)
      .not.toContain(card.answer)
  })

  it('does not show a new answer on a back that is turning away', async () => {
    const screen = await renderCard({ defaultFlipped: true })

    await screen.getByRole('button', { name: 'Show question' }).click()
    await screen.rerender(<Flashcard {...card} answer="Lyon" />)

    expect(screen.container.textContent).not.toContain('Lyon')
  })

  it('flips to the answer on click, and back again', async () => {
    const screen = await renderCard()

    await screen.getByRole('button', { name: 'Show answer' }).click()
    const flipped = screen.getByRole('button', { name: 'Show question' })
    await expect.element(flipped).not.toHaveAttribute('aria-pressed')
    const answer = screen.getByText(card.answer).element()
    expect(answer.closest('[aria-hidden="true"]')).toBeNull()
    // The question side is hidden from assistive technology while turned away.
    expect(
      screen.getByText(card.question).element().closest('[aria-hidden="true"]'),
    ).not.toBeNull()

    await flipped.click()
    await expect
      .element(screen.getByRole('button', { name: 'Show answer' }))
      .toBeInTheDocument()
  })

  it('flips with Enter and with Space', async () => {
    const screen = await render(
      <>
        <button type="button">Before</button>
        <Flashcard {...card} />
      </>,
    )
    screen.getByRole('button', { name: 'Before' }).element().focus()

    await userEvent.tab()
    const flashcard = screen.getByRole('button', { name: /Show/ })
    await expect.element(flashcard).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    await expect.element(flashcard).toHaveAccessibleName('Show question')

    await userEvent.keyboard(' ')
    await expect.element(flashcard).toHaveAccessibleName('Show answer')
  })

  it('shows keyboard focus on the visible face, in the ring color', async () => {
    const screen = await render(
      <>
        <button type="button">Before</button>
        <Flashcard {...card} />
      </>,
    )
    screen.getByRole('button', { name: 'Before' }).element().focus()
    const front = screen.container.querySelector(
      '[data-slot="flashcard-front"]',
    )!

    await settle(front)
    expect(getComputedStyle(front).borderTopColor).toBe('rgb(46, 20, 1)') // neutral-900

    await userEvent.tab()
    await settle(front)
    expect(getComputedStyle(front).borderTopColor).toBe('rgb(80, 114, 199)') // blue-600, the ring color
  })

  it('shows the category Badge and the progress count on both sides', async () => {
    const screen = await renderCard()
    const visibleFace = () =>
      screen.container.querySelector(
        ':is([data-slot="flashcard-front"], [data-slot="flashcard-back"]):not([aria-hidden])',
      )!

    expect(visibleFace().textContent).toContain('Geography')
    expect(visibleFace().textContent).toContain('2/5')

    await screen.getByRole('button').click()

    expect(visibleFace().getAttribute('data-slot')).toBe('flashcard-back')
    expect(visibleFace().textContent).toContain('Geography')
    expect(visibleFace().textContent).toContain('2/5')
  })

  it('clamps progress to 0–5', async () => {
    const screen = await renderCard({ progress: 9 })

    await expect.element(screen.getByText('5/5').first()).toBeInTheDocument()
  })

  it('is pink on the question side and blue on the answer side', async () => {
    const screen = await renderCard()
    const face = (slot: string) =>
      getComputedStyle(
        screen.container.querySelector(`[data-slot="flashcard-${slot}"]`)!,
      ).backgroundColor

    expect(face('front')).toBe('rgb(252, 138, 229)') // pink-400
    expect(face('back')).toBe('rgb(146, 173, 235)') // blue-400
  })

  it('turns over in 3D, in about 400ms', async () => {
    const screen = await renderCard()
    const root = screen.container

    expect(getComputedStyle(inner(root)).transitionDuration).toBe('0.4s')

    await screen.getByRole('button').click()
    await settle(inner(root))
    // rotateY(180deg) as a matrix: the x axis is mirrored.
    expect(getComputedStyle(inner(root)).transform).toMatch(/^matrix3d\(-1,/)
  })

  it('turns over instantly under prefers-reduced-motion', async () => {
    await commands.emulateReducedMotion('reduce')
    onTestFinished(() => commands.emulateReducedMotion(null))
    const screen = await renderCard()
    const root = screen.container

    await screen.getByRole('button').click()

    // No settle(): with no transition, the turn is already at its end.
    expect(inner(root).getAnimations()).toHaveLength(0)
    expect(getComputedStyle(inner(root)).transform).toMatch(/^matrix3d\(-1,/)
  })

  it('starts on the answer side with defaultFlipped', async () => {
    const screen = await renderCard({ defaultFlipped: true })

    await expect
      .element(screen.getByRole('button', { name: 'Show question' }))
      .toBeInTheDocument()
    await expect.element(screen.getByText(card.answer)).toBeVisible()
  })

  it('reports flips through onFlippedChange when uncontrolled', async () => {
    const onFlippedChange = vi.fn()
    const screen = await renderCard({ onFlippedChange })

    await screen.getByRole('button').click()
    await screen.getByRole('button').click()

    expect(onFlippedChange.mock.calls).toEqual([[true], [false]])
  })

  it('follows the flipped prop when controlled', async () => {
    const onFlippedChange = vi.fn()
    const screen = await renderCard({ flipped: false, onFlippedChange })

    await screen.getByRole('button').click()

    // The app didn't update `flipped`, so the card stays on the question.
    expect(onFlippedChange).toHaveBeenCalledWith(true)
    await expect
      .element(screen.getByRole('button', { name: 'Show answer' }))
      .toBeInTheDocument()
    expect(screen.container.textContent).not.toContain(card.answer)
  })

  it('flips when the controlling app updates flipped', async () => {
    function Controlled() {
      const [flipped, setFlipped] = useState(false)
      return (
        <>
          <Flashcard {...card} flipped={flipped} onFlippedChange={setFlipped} />
          <output>{flipped ? 'answer' : 'question'}</output>
        </>
      )
    }
    const screen = await render(<Controlled />)

    await screen.getByRole('button', { name: 'Show answer' }).click()

    await expect.element(screen.getByRole('status')).toHaveTextContent('answer')
    await expect.element(screen.getByText(card.answer)).toBeVisible()
  })

  it('hides the pattern and sparkles from assistive technology', async () => {
    const screen = await renderCard()

    const svgs = Array.from(screen.container.querySelectorAll('svg'))
    expect(svgs.length).toBeGreaterThan(0)
    for (const svg of svgs) {
      expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })

  it('merges a consumer className onto the root', async () => {
    const screen = await renderCard({ className: 'max-w-dialog' })

    expect(
      screen.container
        .querySelector('[data-slot="flashcard"]')
        ?.classList.contains('max-w-dialog'),
    ).toBe(true)
  })
})
