import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { mockStore } from '../mocks/store.js'
import {
  cardList,
  expectShowing,
  FIXTURE,
  hideMastered,
  loadMore,
  shownQuestions,
  toggleCategories,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

const questionsWhere = (match: (card: (typeof FIXTURE)[number]) => boolean) =>
  FIXTURE.filter(match).map((card) => card.question)

const countOf = (category: string) =>
  FIXTURE.filter((card) => card.category === category).length

describe('Category filter', () => {
  it('lists every Category with its global count', async () => {
    await renderApp()

    await page.getByRole('button', { name: 'All Categories' }).click()
    const items = page.getByRole('menuitemcheckbox')
    await expect.element(items.first()).toBeVisible()
    expect(items.elements().map((item) => item.textContent)).toEqual([
      `Biology (${countOf('Biology')})`,
      `Chemistry (${countOf('Chemistry')})`,
      `Geography (${countOf('Geography')})`,
      `History (${countOf('History')})`,
      `Mathematics (${countOf('Mathematics')})`,
      `Programming (${countOf('Programming')})`,
    ])
  })

  it('shows Cards in any selected Category', async () => {
    await renderApp()
    await expectShowing(12, 40)

    await toggleCategories('Biology', 'History')

    const expected = questionsWhere((card) =>
      ['Biology', 'History'].includes(card.category),
    )
    await expectShowing(12, expected.length)
    expect(shownQuestions()).toEqual(expected.slice(0, 12))

    await loadMore()
    await expectShowing(expected.length, expected.length)
    expect(shownQuestions()).toEqual(expected)
    await expect
      .element(page.getByRole('button', { name: 'Load More' }))
      .not.toBeInTheDocument()
  })

  it('shows every Card again when no Category is selected', async () => {
    await renderApp()
    await toggleCategories('Chemistry')
    await expectShowing(countOf('Chemistry'), countOf('Chemistry'))

    await toggleCategories('Chemistry')

    await expectShowing(12, 40)
    expect(shownQuestions()).toEqual(
      FIXTURE.slice(0, 12).map((card) => card.question),
    )
  })

  it('keeps the counts global whatever the filters', async () => {
    await renderApp()
    await toggleCategories('Biology')
    await hideMastered().click()
    await expectShowing(5, 5)

    await page.getByRole('button', { name: 'All Categories' }).click()
    await expect
      .element(page.getByRole('menuitemcheckbox', { name: 'Biology (7)' }))
      .toBeChecked()
    await expect
      .element(page.getByRole('menuitemcheckbox', { name: 'History (7)' }))
      .not.toBeChecked()
  })
})

describe('Hide Mastered', () => {
  it('leaves out Cards at 5 out of 5 Progress', async () => {
    await renderApp()
    await expectShowing(12, 40)

    await hideMastered().click()

    const expected = questionsWhere((card) => card.progress < 5)
    await expectShowing(12, expected.length)
    expect(shownQuestions()).toEqual(expected.slice(0, 12))
    await expect
      .element(cardList().getByText('Mastered 5/5').first())
      .not.toBeInTheDocument()
  })

  it('combines with the Category filter', async () => {
    await renderApp()

    await toggleCategories('Mathematics', 'Chemistry')
    await hideMastered().click()

    const expected = questionsWhere(
      (card) =>
        ['Mathematics', 'Chemistry'].includes(card.category) &&
        card.progress < 5,
    )
    await expectShowing(expected.length, expected.length)
    expect(shownQuestions()).toEqual(expected)
  })
})

describe('changing filters', () => {
  it('starts again from the first 12 matches', async () => {
    await renderApp()
    await loadMore()
    await expectShowing(24, 40)

    await hideMastered().click()
    await expectShowing(12, 32)

    await loadMore()
    await expectShowing(24, 32)
    await hideMastered().click()
    await expectShowing(12, 40)
  })

  it('explains when no Cards match, and can clear the filters', async () => {
    mockStore.reset([
      {
        id: 'card-a',
        question: 'What is 2 + 2?',
        answer: '4.',
        category: 'Mathematics',
        progress: 5,
      },
      {
        id: 'card-b',
        question: 'What is 3 × 3?',
        answer: '9.',
        category: 'Mathematics',
        progress: 5,
      },
    ])
    await renderApp()
    await expectShowing(2, 2)

    await hideMastered().click()

    await expect
      .element(page.getByText('No cards match your filters.'))
      .toBeVisible()
    await expect
      .element(page.getByText('No cards yet.'))
      .not.toBeInTheDocument()

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expectShowing(2, 2)
    await expect.element(hideMastered()).not.toBeChecked()
  })
})
