import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

// Import from the public barrel so a missing export fails the test.
import { CardTile, type CardTileProps } from '../../index.js'

const card = {
  question: 'What is the capital of France?',
  answer: 'Paris',
  category: 'Geography',
  progress: 2,
  onEdit: () => {},
  onDelete: () => {},
} satisfies CardTileProps

const renderTile = (props: Partial<CardTileProps> = {}) =>
  render(<CardTile {...card} {...props} />)

describe('CardTile', () => {
  it('is an article named by its question', async () => {
    const screen = await renderTile()

    await expect
      .element(screen.getByRole('article', { name: card.question }))
      .toBeVisible()
  })

  it('shows the question, the "Answer:" label, the answer and the category', async () => {
    const screen = await renderTile()

    await expect.element(screen.getByText(card.question)).toBeVisible()
    await expect.element(screen.getByText('Answer:')).toBeVisible()
    await expect
      .element(screen.getByText(card.answer, { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByText(card.category)).toBeVisible()
  })

  it('shows the progress bar with its count below 5', async () => {
    const screen = await renderTile({ progress: 2 })

    const bar = screen.getByRole('progressbar', { name: 'Progress' })
    await expect.element(bar).toHaveAttribute('aria-valuenow', '2')
    await expect.element(bar).toHaveAttribute('aria-valuemax', '5')
    await expect.element(screen.getByText('2/5')).toBeVisible()
    expect(screen.container.textContent).not.toContain('Mastered')
  })

  it('shows the Mastered badge instead of the progress bar at 5/5', async () => {
    const screen = await renderTile({ progress: 5 })

    await expect.element(screen.getByText('Mastered 5/5')).toBeVisible()
    expect(screen.getByRole('progressbar').query()).toBeNull()
  })

  it('clamps progress to 0–5', async () => {
    const over = await renderTile({ progress: 9 })
    await expect.element(over.getByText('Mastered 5/5')).toBeVisible()
    await over.unmount()

    const under = await renderTile({ progress: -3 })
    await expect
      .element(under.getByRole('progressbar'))
      .toHaveAttribute('aria-valuenow', '0')
  })

  it('calls onEdit when Edit is picked from the actions menu', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const screen = await renderTile({ onEdit, onDelete })

    const trigger = screen.getByRole('button', { name: 'Card actions' })
    await trigger.click()
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')
    await page.getByRole('menuitem', { name: 'Edit' }).click()

    expect(onEdit).toHaveBeenCalledOnce()
    expect(onDelete).not.toHaveBeenCalled()
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('calls onDelete when Delete is picked from the actions menu', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const screen = await renderTile({ onEdit, onDelete })

    await screen.getByRole('button', { name: 'Card actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()

    expect(onDelete).toHaveBeenCalledOnce()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('opens the menu and picks Delete from the keyboard', async () => {
    const onDelete = vi.fn()
    const screen = await render(
      <>
        <button type="button">Before</button>
        <CardTile {...card} onDelete={onDelete} />
      </>,
    )
    screen.getByRole('button', { name: 'Before' }).element().focus()

    await userEvent.tab()
    const trigger = screen.getByRole('button', { name: 'Card actions' })
    await expect.element(trigger).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    await expect
      .element(page.getByRole('menuitem', { name: 'Edit' }))
      .toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await expect
      .element(page.getByRole('menuitem', { name: 'Delete' }))
      .toHaveFocus()
    await userEvent.keyboard('{Enter}')

    expect(onDelete).toHaveBeenCalledOnce()
    await expect.element(trigger).toHaveFocus()
  })

  it('closes the menu on Escape without calling either action', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const screen = await renderTile({ onEdit, onDelete })

    const trigger = screen.getByRole('button', { name: 'Card actions' })
    await trigger.click()
    await expect.element(page.getByRole('menu')).toBeVisible()
    await userEvent.keyboard('{Escape}')

    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(onEdit).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('wraps a long unbroken answer inside the tile', async () => {
    const answer = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(3)
    const screen = await render(
      <div style={{ width: '280px' }}>
        <CardTile {...card} answer={answer} />
      </div>,
    )

    const tile = screen.getByRole('article').element().getBoundingClientRect()
    const text = screen.getByText(answer).element().getBoundingClientRect()
    expect(text.right).toBeLessThanOrEqual(tile.right)
  })

  it('keeps the actions menu inside a narrow tile with a long category', async () => {
    const screen = await render(
      <div style={{ width: '280px' }}>
        <CardTile
          {...card}
          category="Comparative Indo-European Linguistics"
          progress={5}
        />
      </div>,
    )

    const tile = screen.getByRole('article').element().getBoundingClientRect()
    const trigger = screen
      .getByRole('button', { name: 'Card actions' })
      .element()
      .getBoundingClientRect()
    expect(trigger.right).toBeLessThanOrEqual(tile.right)
    expect(trigger.width).toBeGreaterThan(16)
  })

  it('passes props such as className to the article', async () => {
    const screen = await renderTile({
      className: 'max-w-dialog',
      id: 'card-1',
    })

    const article = screen.getByRole('article').element()
    expect(article.classList.contains('max-w-dialog')).toBe(true)
    expect(article.id).toBe('card-1')
  })
})
