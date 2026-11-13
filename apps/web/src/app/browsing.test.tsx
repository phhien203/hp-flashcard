import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

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

const questions = FIXTURE.map((card) => card.question)

describe('All Cards', () => {
  it('is the default view, marked current in the navigation', async () => {
    await renderApp()

    await expect
      .element(page.getByRole('heading', { level: 1, name: 'All Cards' }))
      .toBeInTheDocument()
    await expect
      .element(page.getByRole('link', { name: 'All Cards' }))
      .toHaveAttribute('aria-current', 'page')
    await expect
      .element(page.getByRole('link', { name: 'Study Mode' }))
      .not.toHaveAttribute('aria-current')
  })

  it('shows the first 12 Cards in the default order', async () => {
    await renderApp()

    await expectShowing(12, 40)
    expect(shownQuestions()).toEqual(questions.slice(0, 12))
  })

  it("shows each Card's question, answer, Category and Progress", async () => {
    await renderApp()
    const [first, second] = FIXTURE

    const mastered = cardList().getByRole('article', { name: first!.question })
    await expect.element(mastered.getByText(first!.answer)).toBeVisible()
    await expect.element(mastered.getByText(first!.category)).toBeVisible()
    await expect.element(mastered.getByText('Mastered 5/5')).toBeVisible()

    const learning = cardList().getByRole('article', {
      name: second!.question,
    })
    await expect
      .element(learning.getByRole('progressbar'))
      .toHaveAttribute('aria-valuenow', String(second!.progress))
  })

  it("offers Edit in each Card's actions, but no Delete yet", async () => {
    await renderApp()
    await expectShowing(12, 40)

    await cardList()
      .getByRole('button', { name: 'Card actions' })
      .first()
      .click()

    await expect
      .element(page.getByRole('menuitem', { name: 'Edit' }))
      .toBeVisible()
    await expect
      .element(page.getByRole('menuitem', { name: 'Delete' }))
      .not.toBeInTheDocument()
  })

  it('appends 12 Cards per Load More until every Card is shown', async () => {
    await renderApp()
    await expectShowing(12, 40)

    await loadMore()
    await expectShowing(24, 40)
    expect(shownQuestions()).toEqual(questions.slice(0, 24))

    await loadMore()
    await expectShowing(36, 40)
    await loadMore()
    await expectShowing(40, 40)

    expect(shownQuestions()).toEqual(questions)
    await expect
      .element(page.getByRole('button', { name: 'Load More' }))
      .not.toBeInTheDocument()
  })
})

describe('Study Mode', () => {
  it('shows exactly "Study Mode Works"', async () => {
    await renderApp()

    await page.getByRole('link', { name: 'Study Mode' }).click()

    await expect
      .element(page.getByRole('heading', { name: 'Study Mode Works' }))
      .toBeVisible()
    expect(page.getByRole('main').element().textContent).toBe(
      'Study Mode Works',
    )
    await expect
      .element(page.getByRole('link', { name: 'Study Mode' }))
      .toHaveAttribute('aria-current', 'page')
    await expect.element(cardList()).not.toBeInTheDocument()
  })

  it('returning to All Cards resets filters, Shuffle and the loaded count', async () => {
    await renderApp({ seeds: [7] })
    await expectShowing(12, 40)

    await toggleCategories('Biology')
    await hideMastered().click()
    await page.getByRole('button', { name: 'Shuffle' }).click()
    await expectShowing(5, 5) // 7 Biology Cards, 2 of them Mastered
    await page.getByRole('link', { name: 'Study Mode' }).click()
    await page.getByRole('link', { name: 'All Cards' }).click()

    await expectShowing(12, 40)
    await expect.element(hideMastered()).not.toBeChecked()
    expect(shownQuestions()).toEqual(questions.slice(0, 12))
    await page.getByRole('button', { name: 'All Categories' }).click()
    await expect
      .element(page.getByRole('menuitemcheckbox', { name: /^Biology/ }))
      .not.toBeChecked()
  })

  it('returning to All Cards starts again from 12 Cards, not the cached pages', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await loadMore()
    await expectShowing(24, 40)

    await page.getByRole('link', { name: 'Study Mode' }).click()
    await expect
      .element(page.getByRole('heading', { name: 'Study Mode Works' }))
      .toBeVisible()
    await page.getByRole('link', { name: 'All Cards' }).click()

    await expectShowing(12, 40)
    expect(shownQuestions()).toEqual(questions.slice(0, 12))
  })
})
