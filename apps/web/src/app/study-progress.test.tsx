import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { worker } from '../mocks/browser.js'
import { SCENARIOS } from '../mocks/scenarios.js'
import { mockStore, type SeedCard } from '../mocks/store.js'
import {
  cardTile,
  expectShowing,
  expectStatistics,
  expectStudying,
  FIXTURE,
  hideMastered,
  holdWrites,
  openStudy,
  studyButton,
  studyCounter,
  studyProgress,
  studyQuestion,
  toggleCategories,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

const questions = FIXTURE.map((card) => card.question)
const progressOf = (id: string) => mockStore.getCard(id)?.progress

/** `n` Cards in one Category, all at `progress`, "Q1" first. */
const seedCards = (n: number, progress: number, category = 'Art'): SeedCard[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${category}-${i + 1}`,
    question: `${category} Q${i + 1}`,
    answer: `${category} A${i + 1}`,
    category,
    progress,
  }))

const countBy = (cards: readonly { progress: number }[]) => ({
  total: cards.length,
  notStarted: cards.filter((card) => card.progress === 0).length,
  inProgress: cards.filter((card) => card.progress > 0 && card.progress < 5)
    .length,
  mastered: cards.filter((card) => card.progress === 5).length,
})

describe('a collection beyond one page', () => {
  it('skips no Card when one leaves at a page boundary, and wraps after', async () => {
    // 14 Cards at 4/5: pages of 12 put Q12 last on the first page.
    mockStore.reset(seedCards(14, 4))
    await renderApp()
    await openStudy()
    await hideMastered().click()
    await expectStudying('Art Q1', 1, 14)
    // Back from Q1 to the second page, then to Q12.
    await studyButton('Previous').click()
    await expectStudying('Art Q14', 14, 14)
    await studyButton('Previous').click()
    await studyButton('Previous').click()
    await expectStudying('Art Q12', 12, 14)

    await studyButton('I Know This').click()

    // Q12 is Mastered and hidden: Q13, first on the next page, takes its place.
    await expectStudying('Art Q13', 12, 13)
    await studyButton('I Know This').click()
    await expectStudying('Art Q14', 12, 12)
    // The last Card leaves: wrap to the first.
    await studyButton('I Know This').click()
    await expectStudying('Art Q1', 1, 11)

    const seen = [studyQuestion()]
    for (let i = 2; i <= 11; i++) {
      await studyButton('Next').click()
      await expectStudying(`Art Q${i}`, i, 11)
      seen.push(studyQuestion())
    }
    expect(seen).toEqual(Array.from({ length: 11 }, (_, i) => `Art Q${i + 1}`))
    await studyButton('Next').click()
    await expectStudying('Art Q1', 1, 11)
  })
})

describe('Study Statistics', () => {
  it('count every Card, by Progress', async () => {
    await renderApp()
    await openStudy()

    await expectStatistics(countBy(FIXTURE))
  })

  it('follow the chosen Categories, across the whole collection', async () => {
    await renderApp()
    await openStudy()

    await toggleCategories('Biology', 'Chemistry')

    await expectStatistics(
      countBy(
        FIXTURE.filter((card) =>
          ['Biology', 'Chemistry'].includes(card.category),
        ),
      ),
    )
  })

  it('ignore Hide Mastered and Shuffle', async () => {
    await renderApp({ seeds: [5] })
    await openStudy()
    await toggleCategories('Programming')
    const programming = countBy(
      FIXTURE.filter((card) => card.category === 'Programming'),
    )
    await expectStatistics(programming)

    await hideMastered().click()
    await expect
      .element(studyCounter())
      .toHaveTextContent(
        `Card 1 of ${programming.total - programming.mastered}`,
      )
    await studyButton('Shuffle').click()

    await expectStatistics(programming)
  })

  it('follow I Know This and Reset Progress', async () => {
    await renderApp()
    await openStudy()
    await studyButton('Next').click()
    await expectStudying(questions[1]!, 2, 40) // card-02, 4/5

    await studyButton('I Know This').click()
    await expectStudying(questions[2]!, 3, 40)

    await expectStatistics({
      total: 40,
      notStarted: 8,
      inProgress: 23,
      mastered: 9,
    })
    await studyButton('Reset Progress').click() // card-03, 5/5
    await expectStatistics({
      total: 40,
      notStarted: 9,
      inProgress: 23,
      mastered: 8,
    })
  })
})

describe('empty states', () => {
  it('with no Cards: says so, offers All Cards, and keeps the filters and statistics', async () => {
    SCENARIOS.empty(mockStore)
    await renderApp()
    await page.getByRole('link', { name: 'Study Mode' }).click()

    await expect
      .element(page.getByRole('heading', { name: 'No cards to study' }))
      .toBeVisible()
    await expect
      .element(
        page.getByText(
          'You don’t have any cards yet. Add your first card in the All Cards tab.',
        ),
      )
      .toBeVisible()
    await expectStatistics({
      total: 0,
      notStarted: 0,
      inProgress: 0,
      mastered: 0,
    })
    await expect.element(hideMastered()).toBeVisible()
    await expect
      .element(page.getByRole('button', { name: 'All Categories' }))
      .toBeVisible()
    await expect.element(studyButton('Shuffle')).toBeDisabled()
    for (const name of ['I Know This', 'Reset Progress', 'Previous', 'Next'])
      await expect
        .element(page.getByRole('button', { name }))
        .not.toBeInTheDocument()
    await expect.element(studyCounter()).not.toBeInTheDocument()
    await expect
      .element(page.getByRole('navigation', { name: 'Cards' }))
      .not.toBeInTheDocument()

    await page.getByRole('link', { name: 'Go to All Cards' }).click()
    await expect
      .element(page.getByRole('link', { name: 'All Cards' }))
      .toHaveAttribute('aria-current', 'page')
    await expect.element(page.getByText('No cards yet.')).toBeVisible()
  })

  it('with every Card Mastered and hidden: all caught up, until Hide Mastered is off', async () => {
    mockStore.reset(seedCards(2, 5))
    await renderApp()
    await openStudy()

    await hideMastered().click()

    await expect
      .element(page.getByRole('heading', { name: 'You’re all caught up!' }))
      .toBeVisible()
    await expect
      .element(page.getByText(/^All your cards are mastered\./))
      .toBeVisible()
    await expect
      .element(page.getByText(/Turn off “Hide Mastered”/))
      .toBeVisible()
    await expectStatistics({
      total: 2,
      notStarted: 0,
      inProgress: 0,
      mastered: 2,
    })
    await expect.element(studyCounter()).not.toBeInTheDocument()
    await expect
      .element(page.getByRole('button', { name: 'Already Mastered' }))
      .not.toBeInTheDocument()
    await expect.element(studyButton('Shuffle')).toBeDisabled()
    for (const name of ['Show mastered cards', 'Clear filters'])
      await expect
        .element(page.getByRole('button', { name }))
        .not.toBeInTheDocument()

    await hideMastered().click()
    await expectStudying('Art Q1', 1, 2)
  })

  it('speaks only of the chosen Categories when they are all caught up', async () => {
    mockStore.reset([...seedCards(2, 5), ...seedCards(3, 1, 'Music')])
    await renderApp()
    await openStudy()

    await toggleCategories('Art')
    await hideMastered().click()

    await expect
      .element(
        page.getByText(/^All cards in the selected categories are mastered\./),
      )
      .toBeVisible()
    await expect
      .element(page.getByText(/All your cards are mastered/))
      .not.toBeInTheDocument()
    await expectStatistics({
      total: 2,
      notStarted: 0,
      inProgress: 0,
      mastered: 2,
    })

    await toggleCategories('Music')
    await expectStudying('Music Q1', 1, 3)
  })

  it('appear when scoring masters the last Card Hide Mastered leaves', async () => {
    mockStore.reset(seedCards(1, 4))
    await renderApp()
    await openStudy()
    await hideMastered().click()
    await expectStudying('Art Q1', 1, 1)

    await studyButton('I Know This').click()

    await expect
      .element(page.getByRole('heading', { name: 'You’re all caught up!' }))
      .toBeVisible()
    await expectStatistics({
      total: 1,
      notStarted: 0,
      inProgress: 0,
      mastered: 1,
    })
  })
})

describe('saving Progress', () => {
  it('disables the progress actions while saving, so a second press credits nothing', async () => {
    const held = holdWrites('put')
    worker.use(held.handler)
    await renderApp()
    await openStudy()
    await studyButton('Next').click()
    await expectStudying(questions[1]!, 2, 40) // card-02, 4/5

    await studyButton('I Know This').click()

    await expect.element(studyButton('I Know This')).toBeDisabled()
    await expect.element(studyButton('Reset Progress')).toBeDisabled()
    await expect.element(studyButton('Next')).toBeDisabled()
    await expect.element(page.getByText('Saving progress…')).toBeInTheDocument()
    await studyButton('I Know This').click({ force: true })
    expect(held.requests()).toBe(1)
    // Nothing moves until the save succeeds.
    expect(studyQuestion()).toBe(questions[1])

    held.release()
    await expectStudying(questions[2]!, 3, 40)
    expect(held.requests()).toBe(1)
    expect(progressOf('card-02')).toBe(5)
  })

  it('keeps the Card and its Progress when a save fails, and Retry credits once', async () => {
    worker.use(...SCENARIOS['progress-error']())
    await renderApp()
    await openStudy()
    for (let i = 0; i < 3; i++) await studyButton('Next').click()
    await expectStudying(questions[3]!, 4, 40) // card-04, 2/5
    await page.getByRole('button', { name: 'Show answer' }).click()

    await studyButton('I Know This').click()

    const alert = page
      .getByRole('alert')
      .filter({ hasText: 'Your progress could not be saved.' })
    await expect.element(alert).toBeVisible()
    // Still this Card, its answer still showing, its Progress unchanged.
    await expect.element(page.getByText(FIXTURE[3]!.answer)).toBeVisible()
    await expect.element(studyCounter()).toHaveTextContent('Card 4 of 40')
    expect(studyProgress()).toBe('2/5')
    expect(progressOf('card-04')).toBe(2)
    await expectStatistics(countBy(FIXTURE))

    await alert.getByRole('button', { name: 'Retry' }).click()

    await expectStudying(questions[4]!, 5, 40)
    await expect.element(alert).not.toBeInTheDocument()
    expect(progressOf('card-04')).toBe(3)
  })

  it('keeps the Card when a reset fails, and Retry resets it', async () => {
    worker.use(...SCENARIOS['progress-error']())
    await renderApp()
    await openStudy()

    await studyButton('Reset Progress').click()

    const alert = page
      .getByRole('alert')
      .filter({ hasText: 'Your progress could not be saved.' })
    await expect.element(alert).toBeVisible()
    expect(studyProgress()).toBe('Mastered 5/5')
    expect(progressOf('card-01')).toBe(5)

    await alert.getByRole('button', { name: 'Retry' }).click()

    await expect.poll(studyProgress).toBe('0/5')
    await expectStudying(questions[0]!, 1, 40)
    expect(progressOf('card-01')).toBe(0)
  })

  it('shows in All Cards, and survives navigation and a remount', async () => {
    localStorage.clear()
    sessionStorage.clear()
    const first = await renderApp()
    await openStudy()
    await studyButton('Next').click()
    await studyButton('I Know This').click() // card-02: 4 → 5
    await expectStudying(questions[2]!, 3, 40)
    await studyButton('Next').click()
    await studyButton('Reset Progress').click() // card-04: 2 → 0
    await expect.poll(studyProgress).toBe('0/5')

    await page.getByRole('link', { name: 'All Cards' }).click()
    await expectShowing(12, 40)
    await expect
      .element(cardTile(questions[1]!).getByText('Mastered 5/5'))
      .toBeVisible()
    await expect
      .element(
        cardTile(questions[3]!).getByRole('progressbar', { name: 'Progress' }),
      )
      .toHaveAttribute('aria-valuenow', '0')
    await first.unmount()

    await renderApp()
    await openStudy()
    await expectStatistics({
      total: 40,
      notStarted: 9,
      inProgress: 22,
      mastered: 9,
    })
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })
})
