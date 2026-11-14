import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { worker } from '../mocks/browser.js'
import { SCENARIOS } from '../mocks/scenarios.js'
import { seededShuffle } from '../domain/shuffle.js'
import { mockStore, type SeedCard } from '../mocks/store.js'
import {
  cardList,
  cardTile,
  categoryMenuItems,
  deleteButton,
  deleteCard,
  deleteDialog,
  expectShowing,
  FIXTURE,
  hideMastered,
  holdWrites,
  loadMore,
  openDelete,
  shownQuestions,
  toast,
  toggleCategories,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

const questions = FIXTURE.map((card) => card.question)
const countOf = (category: string) =>
  FIXTURE.filter((card) => card.category === category).length

/** card-02: Geography, second in the default order. */
const CANBERRA = FIXTURE[1]!

/** A Card in the grid, by id, even while a modal hides the grid. */
const gridCard = (id: string) =>
  document.querySelector(`[data-card-id="${id}"]`)

const actionsOf = (question: string) =>
  cardTile(question).getByRole('button', { name: 'Card actions' })

const card = (id: string, category: string, progress = 0): SeedCard => ({
  id,
  question: `Q ${id}?`,
  answer: `A ${id}.`,
  category,
  progress,
})

describe('the delete confirmation', () => {
  it('asks first, naming the consequence, with Cancel focused', async () => {
    await renderApp()
    await expectShowing(12, 40)

    await openDelete(CANBERRA.question)

    await expect
      .element(deleteDialog())
      .toHaveAccessibleDescription('This action cannot be undone.')
    await expect
      .element(deleteDialog().getByRole('button', { name: 'Cancel' }))
      .toHaveFocus()
    await expect
      .element(deleteDialog().getByRole('button', { name: 'Delete Card' }))
      .toBeVisible()
  })

  it.for([
    {
      path: 'Cancel',
      close: () =>
        deleteDialog().getByRole('button', { name: 'Cancel' }).click(),
    },
    { path: 'Escape', close: () => userEvent.keyboard('{Escape}') },
  ])('$path keeps the Card and returns focus', async ({ close }) => {
    const held = holdWrites('delete')
    worker.use(held.handler)
    await renderApp()
    await expectShowing(12, 40)
    await openDelete(CANBERRA.question)

    await close()

    await expect.element(deleteDialog()).not.toBeInTheDocument()
    await expect.element(actionsOf(CANBERRA.question)).toHaveFocus()
    await expectShowing(12, 40)
    expect(held.requests()).toBe(0)
    expect(mockStore.getCard(CANBERRA.id)).toBeDefined()
    expect(await categoryMenuItems()).toContain(
      `Geography (${countOf('Geography')})`,
    )
  })

  it('stays open on a click outside, without deleting', async () => {
    const held = holdWrites('delete')
    worker.use(held.handler)
    await renderApp()
    await expectShowing(12, 40)
    await openDelete(CANBERRA.question)

    // The backdrop covers the page; click its top-left corner.
    await userEvent.click(document.body, { position: { x: 4, y: 4 } })

    await expect.element(deleteDialog()).toBeVisible()
    expect(held.requests()).toBe(0)
    expect(gridCard(CANBERRA.id)).not.toBeNull()
  })
})

describe('deleting a Card', () => {
  it('removes it, refills the page, updates the counts and confirms', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await openDelete(CANBERRA.question)

    await deleteButton().click()

    await expect.element(deleteDialog()).not.toBeInTheDocument()
    await expect.element(toast('Card deleted successfully.')).toBeVisible()
    await expectShowing(12, 39)
    expect(shownQuestions()).toEqual([questions[0], ...questions.slice(2, 13)])
    // Focus moves to the next Card.
    await expect.element(actionsOf(questions[2]!)).toHaveFocus()
    expect(await categoryMenuItems()).toContain(
      `Geography (${countOf('Geography') - 1})`,
    )
    expect(mockStore.getCard(CANBERRA.id)).toBeUndefined()
  })

  it('works from the keyboard', async () => {
    await renderApp()
    await expectShowing(12, 40)

    actionsOf(CANBERRA.question).element().focus()
    await userEvent.keyboard('{Enter}')
    await expect
      .element(page.getByRole('menuitem', { name: 'Edit' }))
      .toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await expect
      .element(page.getByRole('menuitem', { name: 'Delete' }))
      .toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect.element(deleteDialog()).toBeVisible()
    await userEvent.tab()
    await expect.element(deleteButton()).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    await expect.element(toast('Card deleted successfully.')).toBeVisible()
    await expect.element(cardTile(CANBERRA.question)).not.toBeInTheDocument()
    await expect.element(actionsOf(questions[2]!)).toHaveFocus()
  })
})

describe('a pending deletion', () => {
  it('sends one request, can’t be closed, and keeps the Card until done', async () => {
    const held = holdWrites('delete')
    worker.use(held.handler)
    await renderApp()
    await expectShowing(12, 40)
    await openDelete(CANBERRA.question)

    await deleteButton().click()

    const pending = deleteDialog().getByRole('button', {
      name: 'Deleting Card…',
    })
    await expect.element(pending).toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(deleteDialog().getByRole('button', { name: 'Cancel' }))
      .toBeDisabled()
    await pending.click({ force: true })
    await userEvent.keyboard('{Escape}')
    await expect.element(deleteDialog()).toBeVisible()
    expect(held.requests()).toBe(1)
    // No optimistic removal: the Card stays until the backend agrees.
    expect(gridCard(CANBERRA.id)).not.toBeNull()
    await expectShowing(12, 40)

    held.release()

    await expect.element(deleteDialog()).not.toBeInTheDocument()
    await expectShowing(12, 39)
    expect(gridCard(CANBERRA.id)).toBeNull()
    expect(held.requests()).toBe(1)
  })
})

describe('a failed deletion', () => {
  it('keeps the Card, explains, and succeeds on retry', async () => {
    worker.use(...SCENARIOS['delete-error']())
    await renderApp()
    await expectShowing(12, 40)
    await openDelete(CANBERRA.question)

    await deleteButton().click()

    await expect
      .element(deleteDialog().getByRole('alert'))
      .toHaveTextContent('Your card could not be deleted. Please try again.')
    await expect.element(deleteButton()).toHaveTextContent('Delete Card')
    expect(gridCard(CANBERRA.id)).not.toBeNull()
    expect(mockStore.getCard(CANBERRA.id)).toBeDefined()

    await deleteButton().click()

    await expect.element(deleteDialog()).not.toBeInTheDocument()
    await expect.element(toast('Card deleted successfully.')).toBeVisible()
    await expectShowing(12, 39)
    expect(gridCard(CANBERRA.id)).toBeNull()
  })

  it('can be cancelled instead, keeping the Card', async () => {
    worker.use(...SCENARIOS['delete-error']())
    await renderApp()
    await expectShowing(12, 40)
    await openDelete(CANBERRA.question)
    await deleteButton().click()
    await expect.element(deleteDialog().getByRole('alert')).toBeVisible()

    await deleteDialog().getByRole('button', { name: 'Cancel' }).click()

    await expect.element(deleteDialog()).not.toBeInTheDocument()
    await expect.element(actionsOf(CANBERRA.question)).toHaveFocus()
    await expectShowing(12, 40)
  })

  it('drops a Card the backend no longer has, and says so', async () => {
    worker.use(...SCENARIOS['delete-not-found'](mockStore))
    await renderApp()
    await expectShowing(12, 40)
    await openDelete(CANBERRA.question)

    await deleteButton().click()

    await expect.element(deleteDialog()).not.toBeInTheDocument()
    await expect
      .element(toast('That card had already been deleted.'))
      .toBeVisible()
    await expectShowing(12, 39)
    expect(gridCard(CANBERRA.id)).toBeNull()
  })
})

describe('deleting while browsing', () => {
  it('removes a Category with its last Card, keeping other selections', async () => {
    mockStore.reset([
      card('a', 'Art'),
      card('m', 'Music'),
      card('s1', 'Sport'),
      card('s2', 'Sport'),
    ])
    await renderApp()
    await toggleCategories('Art', 'Sport')
    await expectShowing(3, 3)

    await deleteCard('Q a?')

    await expectShowing(2, 2)
    expect(shownQuestions()).toEqual(['Q s1?', 'Q s2?'])
    await page.getByRole('button', { name: 'All Categories' }).click()
    await expect
      .element(page.getByRole('menuitemcheckbox', { name: 'Sport (2)' }))
      .toBeChecked()
    expect(
      page
        .getByRole('menuitemcheckbox')
        .elements()
        .map((item) => item.textContent),
    ).toEqual(['Music (1)', 'Sport (2)'])
  })

  it('shows every Category when the only selected one is removed', async () => {
    mockStore.reset([card('a', 'Art'), card('m', 'Music')])
    await renderApp()
    await toggleCategories('Art')
    await expectShowing(1, 1)

    await deleteCard('Q a?')

    await expectShowing(1, 1)
    expect(shownQuestions()).toEqual(['Q m?'])
    expect(await categoryMenuItems()).toEqual(['Music (1)'])
    await expect
      .element(page.getByRole('button', { name: 'All Categories' }))
      .toBeVisible()
  })

  it('shows the empty state after the last Card, focusing the page', async () => {
    mockStore.reset([card('a', 'Art')])
    await renderApp()
    await expectShowing(1, 1)

    await deleteCard('Q a?')

    await expect.element(page.getByText('No cards yet.')).toBeVisible()
    await expect.element(cardList()).not.toBeInTheDocument()
    await expect
      .element(page.getByRole('button', { name: 'Load More' }))
      .not.toBeInTheDocument()
    await expect
      .element(page.getByRole('heading', { name: 'All Cards' }))
      .toHaveFocus()
    await page.getByRole('button', { name: 'All Categories' }).click()
    await expect
      .element(page.getByRole('menuitemcheckbox'))
      .not.toBeInTheDocument()
  })

  it('shows the filtered empty state after the last matching Card', async () => {
    mockStore.reset([card('a', 'Art', 1), card('b', 'Art', 5)])
    await renderApp()
    await hideMastered().click()
    await expectShowing(1, 1)

    await deleteCard('Q a?')

    await expect
      .element(page.getByText('No cards match your filters.'))
      .toBeVisible()
    await expect.element(hideMastered()).toBeChecked()
    expect(await categoryMenuItems()).toEqual(['Art (1)'])

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expectShowing(1, 1)
    expect(shownQuestions()).toEqual(['Q b?'])
  })

  it('drops the only Card of the last loaded page, without Load More', async () => {
    mockStore.reset(FIXTURE.slice(0, 37))
    await renderApp()
    await loadMore()
    await expectShowing(24, 37)
    await loadMore()
    await expectShowing(36, 37)
    await loadMore()
    await expectShowing(37, 37)

    await deleteCard(questions[36]!)

    await expectShowing(36, 36)
    expect(shownQuestions()).toEqual(questions.slice(0, 36))
    await expect
      .element(page.getByRole('button', { name: 'Load More' }))
      .not.toBeInTheDocument()
    // Focus goes to the Card before it.
    await expect.element(actionsOf(questions[35]!)).toHaveFocus()
  })

  it('keeps Load More coherent after deleting from an earlier page', async () => {
    await renderApp()
    await loadMore()
    await expectShowing(24, 40)

    await deleteCard(questions[3]!)

    const expected = questions.filter((_, i) => i !== 3)
    await expectShowing(24, 39)
    expect(shownQuestions()).toEqual(expected.slice(0, 24))
    await loadMore()
    await expectShowing(36, 39)
    await loadMore()
    await expectShowing(39, 39)
    expect(shownQuestions()).toEqual(expected)
  })

  it('keeps a shuffled order, and Load More continues it', async () => {
    await renderApp({ seeds: [42] })
    await expectShowing(12, 40)
    await page.getByRole('button', { name: 'Shuffle' }).click()
    const order = seededShuffle(FIXTURE, 42, (c) => c.id)
    await expect
      .poll(shownQuestions)
      .toEqual(order.slice(0, 12).map((c) => c.question))

    await deleteCard(order[0]!.question)

    const rest = order.slice(1).map((c) => c.question)
    await expectShowing(12, 39)
    expect(shownQuestions()).toEqual(rest.slice(0, 12))
    await loadMore()
    await loadMore()
    await loadMore()
    await expectShowing(39, 39)
    expect(shownQuestions()).toEqual(rest)
  })

  it('keeps the selection and its global counts in a filtered view', async () => {
    await renderApp()
    await toggleCategories('Chemistry')
    await expectShowing(countOf('Chemistry'), countOf('Chemistry'))

    await deleteCard('What is the charge of a proton?')

    await expectShowing(countOf('Chemistry') - 1, countOf('Chemistry') - 1)
    const items = await categoryMenuItems()
    expect(items).toContain(`Chemistry (${countOf('Chemistry') - 1})`)
    expect(items).toContain(`Biology (${countOf('Biology')})`)
  })
})
