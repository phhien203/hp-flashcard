import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { seededShuffle } from '../domain/shuffle.js'
import { mockStore } from '../mocks/store.js'
import {
  cardTile,
  categoryMenuItems,
  createCard,
  deleteCard,
  editDialog,
  expectRevealed,
  expectShowing,
  fillFields,
  FIXTURE,
  hideMastered,
  loadMore,
  openEdit,
  shownQuestions,
  toast,
  toggleCategories,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

/**
 * Card management end to end: creating, editing and deleting Cards while
 * browsing, as a user would mix them.
 */

const questions = FIXTURE.map((card) => card.question)

/** The All Categories menu as the fixture alone gives it. */
const fixtureCategories = () => {
  const counts = new Map<string, number>()
  for (const card of FIXTURE)
    counts.set(card.category, (counts.get(card.category) ?? 0) + 1)
  return byName([...counts].map(([name, count]) => `${name} (${count})`))
}

/** Sorted as the backend sorts Categories. */
const byName = (items: string[]) => items.sort((a, b) => a.localeCompare(b))

const updateCard = () =>
  editDialog().getByRole('button', { name: 'Update Card' }).click()

const ART = { question: 'Who painted the Mona Lisa?', answer: 'Leonardo.' }

describe('a Category through its life', () => {
  it('is created, moved out of, revealed, and removed with its last Card', async () => {
    await renderApp()
    await expectShowing(12, 40)

    // A new Category comes into existence with its first Card.
    await createCard({ ...ART, category: ' Art ' })
    await expect.element(toast('Card created successfully.')).toBeVisible()
    expect(await categoryMenuItems()).toContain('Art (1)')

    // Browse it alongside History.
    await toggleCategories('Art', 'History')
    const history = FIXTURE.filter((card) => card.category === 'History')
    await expectShowing(history.length + 1, history.length + 1)
    expect(shownQuestions()[0]).toBe(ART.question)

    // Moving its only Card out removes Art, and its selection; History
    // stays selected, so the moved Card is hidden.
    await openEdit(ART.question)
    await fillFields(editDialog(), { category: 'MUSIC' })
    await updateCard()
    const hidden = toast('Card updated successfully. Your filters hide it.')
    await expect.element(hidden).toBeVisible()
    await expectShowing(history.length, history.length)
    await page.getByRole('button', { name: 'All Categories' }).click()
    await expect
      .element(page.getByRole('menuitemcheckbox', { name: /^History/ }))
      .toBeChecked()
    expect(
      page
        .getByRole('menuitemcheckbox')
        .elements()
        .map((item) => item.textContent),
    ).toEqual(byName([...fixtureCategories(), 'MUSIC (1)']))
    await userEvent.keyboard('{Escape}')

    // Show card clears the filters and reveals it.
    await hidden.getByRole('button', { name: 'Show card' }).click()
    await expectRevealed(ART.question)
    await expectShowing(12, 41)

    // Deleting it removes MUSIC: back to the fixture's Categories and
    // counts, with every Card shown.
    await deleteCard(ART.question)
    await expectShowing(12, 40)
    expect(shownQuestions()).toEqual(questions.slice(0, 12))
    expect(await categoryMenuItems()).toEqual(fixtureCategories())
  })
})

describe('Show card', () => {
  it('explains when the saved Card has since been deleted', async () => {
    await renderApp()
    await toggleCategories('Geography')
    const canberra = FIXTURE[1]!

    await openEdit(canberra.question)
    await fillFields(editDialog(), { category: 'History' })
    await updateCard()
    const hidden = toast('Card updated successfully. Your filters hide it.')
    await expect.element(hidden).toBeVisible()

    // Clear the filter by hand, then delete the edited Card.
    await toggleCategories('Geography')
    await expectShowing(12, 40)
    await deleteCard(canberra.question)
    await expectShowing(12, 39)

    await hidden.getByRole('button', { name: 'Show card' }).click()

    // A high-priority toast, announced as an alert.
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('That card no longer exists.')
    await expectShowing(12, 39)
    await expect.element(cardTile(canberra.question)).not.toBeInTheDocument()
  })
})

describe('a shuffled, paged collection', () => {
  it('stays complete and free of duplicates across create, edit and delete', async () => {
    await renderApp({ seeds: [7] })
    await expectShowing(12, 40)
    await page.getByRole('button', { name: 'Shuffle' }).click()
    const order = seededShuffle(FIXTURE, 7, (card) => card.id)
    await expect
      .poll(shownQuestions)
      .toEqual(order.slice(0, 12).map((card) => card.question))
    await loadMore()
    await expectShowing(24, 40)

    await createCard({ ...ART, category: 'Art' })
    await expect.element(toast('Card created successfully.')).toBeVisible()
    await expectShowing(24, 41)

    const edited = order[3]!
    await openEdit(edited.question)
    await fillFields(editDialog(), { question: 'Edited, still shuffled?' })
    await updateCard()
    await expect.element(toast('Card updated successfully.')).toBeVisible()

    const deleted = order[5]!
    await deleteCard(deleted.question)
    await expectShowing(24, 40)

    await loadMore()
    await expectShowing(36, 40)
    await loadMore()
    await expectShowing(40, 40)

    const shown = shownQuestions()
    const expected = order
      .filter((card) => card !== deleted)
      .map((card) =>
        card === edited ? 'Edited, still shuffled?' : card.question,
      )
    // The fixture's Cards keep their shuffled order; the new one slots in.
    expect(shown.filter((q) => q !== ART.question)).toEqual(expected)
    expect(new Set(shown).size).toBe(40)
    expect(shown).toContain(ART.question)
  })

  it('keeps Hide Mastered and a Category selection through a delete', async () => {
    await renderApp()
    await toggleCategories('Biology', 'Chemistry')
    await hideMastered().click()
    const matching = FIXTURE.filter(
      (card) =>
        ['Biology', 'Chemistry'].includes(card.category) && card.progress < 5,
    )
    await expectShowing(matching.length, matching.length)

    await deleteCard(matching[0]!.question)

    await expectShowing(matching.length - 1, matching.length - 1)
    expect(shownQuestions()).toEqual(
      matching.slice(1).map((card) => card.question),
    )
    await expect.element(hideMastered()).toBeChecked()
    const items = await categoryMenuItems()
    expect(items).toContain(
      `${matching[0]!.category} (${
        FIXTURE.filter((card) => card.category === matching[0]!.category)
          .length - 1
      })`,
    )
  })
})

describe('saved changes and navigation', () => {
  it('keep creations, edits and deletions across navigation, until a refresh', async () => {
    const first = await renderApp()
    await expectShowing(12, 40)
    await createCard({ ...ART, category: 'Art' })
    await expectShowing(12, 41)
    await openEdit(questions[2]!)
    await fillFields(editDialog(), { answer: 'HyperText Markup Language!' })
    await updateCard()
    await expect.element(toast('Card updated successfully.')).toBeVisible()
    await deleteCard(questions[1]!)
    await expectShowing(12, 40)

    await page.getByRole('link', { name: 'Study Mode' }).click()
    await expect
      .element(page.getByRole('heading', { name: 'Study Mode', level: 1 }))
      .toBeVisible()
    await page.getByRole('link', { name: 'All Cards' }).click()

    await expectShowing(12, 40)
    expect(shownQuestions()).toEqual([
      ART.question,
      questions[0],
      ...questions.slice(2, 12),
    ])
    await expect
      .element(cardTile(questions[2]!).getByText('HyperText Markup Language!'))
      .toBeVisible()
    expect(await categoryMenuItems()).toContain('Art (1)')
    await first.unmount()

    // A browser refresh starts the mock backend afresh, from the fixture.
    mockStore.reset()
    await renderApp()
    await expectShowing(12, 40)
    expect(shownQuestions()).toEqual(questions.slice(0, 12))
    expect(await categoryMenuItems()).toEqual(fixtureCategories())
  })
})
