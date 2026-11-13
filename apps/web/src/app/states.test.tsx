import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { worker } from '../mocks/browser.js'
import { SCENARIOS } from '../mocks/scenarios.js'
import { mockStore } from '../mocks/store.js'
import {
  expectShowing,
  FIXTURE,
  holdCardRequests,
  loadMore,
  shownQuestions,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

const questions = FIXTURE.map((card) => card.question)

describe('loading', () => {
  it('shows a loading state until the first Cards arrive', async () => {
    const held = holdCardRequests((offset) => offset === 0)
    worker.use(held.handler)
    await renderApp()

    await expect
      .element(page.getByRole('status').getByText('Loading cards…'))
      .toBeVisible()

    held.release()
    await expectShowing(12, 40)
    await expect
      .element(page.getByText('Loading cards…'))
      .not.toBeInTheDocument()
  })

  it('keeps the Cards on screen while the next page loads', async () => {
    const held = holdCardRequests((offset) => offset > 0)
    worker.use(held.handler)
    await renderApp()
    await expectShowing(12, 40)

    await loadMore()

    const button = page.getByRole('button', { name: 'Loading…' })
    await expect.element(button).toBeDisabled()
    await expect
      .element(page.getByText('Loading more cards…'))
      .toBeInTheDocument()
    expect(shownQuestions()).toEqual(questions.slice(0, 12))

    held.release()
    await expectShowing(24, 40)
  })
})

describe('empty', () => {
  it('explains that there are no Cards yet', async () => {
    SCENARIOS.empty(mockStore)
    await renderApp()

    await expect.element(page.getByText('No cards yet.')).toBeVisible()
    await expect
      .element(page.getByText('Cards you create will appear here.'))
      .toBeVisible()
    await expect
      .element(page.getByText('No cards match your filters.'))
      .not.toBeInTheDocument()
    await expect
      .element(page.getByRole('button', { name: 'Load More' }))
      .not.toBeInTheDocument()
  })
})

describe('failures', () => {
  it('shows an error when the first Cards fail to load, and retries', async () => {
    worker.use(...SCENARIOS['initial-error']())
    await renderApp()

    const alert = page.getByRole('alert')
    await expect
      .element(alert.getByText('Cards could not be loaded.'))
      .toBeVisible()

    await alert.getByRole('button', { name: 'Retry' }).click()

    await expectShowing(12, 40)
    await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the Cards shown when a later page fails, and retries it', async () => {
    worker.use(...SCENARIOS['page-error']())
    await renderApp()
    await expectShowing(12, 40)

    await loadMore()

    const alert = page.getByRole('alert')
    await expect
      .element(alert.getByText('More cards could not be loaded.'))
      .toBeVisible()
    expect(shownQuestions()).toEqual(questions.slice(0, 12))

    await alert.getByRole('button', { name: 'Retry' }).click()

    await expectShowing(24, 40)
    expect(shownQuestions()).toEqual(questions.slice(0, 24))
    await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
    await expect
      .element(page.getByRole('button', { name: 'Load More' }))
      .toBeVisible()
  })

  it('shows an error when the Categories fail to load, and retries', async () => {
    worker.use(...SCENARIOS['categories-error']())
    await renderApp()

    const alert = page.getByRole('alert')
    await expect
      .element(alert.getByText('Categories could not be loaded.'))
      .toBeVisible()
    await expectShowing(12, 40)

    await alert.getByRole('button', { name: 'Retry' }).click()

    await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
    await page.getByRole('button', { name: 'All Categories' }).click()
    await expect
      .element(page.getByRole('menuitemcheckbox', { name: 'Biology (7)' }))
      .toBeVisible()
  })
})
