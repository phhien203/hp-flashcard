import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { seededShuffle } from '../mocks/shuffle.js'
import { mockStore, type SeedCard } from '../mocks/store.js'
import {
  expectShowing,
  expectStatistics,
  expectStudying,
  FIXTURE,
  hideMastered,
  openStudy,
  studyButton,
  studyProgress,
  studyQuestion,
  toggleCategories,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

const questions = FIXTURE.map((card) => card.question)
const progressOf = (id: string) => mockStore.getCard(id)?.progress

const showAnswer = () => page.getByRole('button', { name: 'Show answer' })
const showQuestion = () => page.getByRole('button', { name: 'Show question' })

/** The fixture's statistics: 40 Cards, 8 at 0, 24 at 1–4, 8 at 5. */
const FIXTURE_STATISTICS = {
  total: 40,
  notStarted: 8,
  inProgress: 24,
  mastered: 8,
}

/** `n` Cards in one Category, all at `progress`, "Q1" first. */
const seedCards = (n: number, progress: number, category = 'Art'): SeedCard[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${category}-${i + 1}`,
    question: `${category} Q${i + 1}`,
    answer: `${category} A${i + 1}`,
    category,
    progress,
  }))

describe('studying a Card', () => {
  it('starts on the first Card with its answer hidden; activating it reveals the answer and the question again', async () => {
    await renderApp()
    await openStudy()

    await expectStudying(questions[0]!, 1, 40)
    await expect
      .element(page.getByText(FIXTURE[0]!.answer))
      .not.toBeInTheDocument()

    await showAnswer().click()
    await expect.element(page.getByText(FIXTURE[0]!.answer)).toBeVisible()

    await showQuestion().click()
    await expect.element(showAnswer()).toBeInTheDocument()
    await expect
      .element(page.getByText(questions[0]!, { exact: true }))
      .toBeVisible()
  })

  it('shows a Mastered Card as Mastered 5/5, with Already Mastered disabled', async () => {
    await renderApp()
    await openStudy()

    // card-01 is Mastered.
    expect(studyProgress()).toBe('Mastered 5/5')
    await expect.element(studyButton('Already Mastered')).toBeDisabled()
    await expect.element(studyButton('Reset Progress')).toBeEnabled()
    await expect
      .element(page.getByRole('button', { name: 'I Know This' }))
      .not.toBeInTheDocument()
  })

  it('credits I Know This from the question side and moves on to the next question', async () => {
    await renderApp()
    await openStudy()
    await studyButton('Next').click()
    await expectStudying(questions[1]!, 2, 40) // card-02, 4/5
    expect(studyProgress()).toBe('4/5')

    await studyButton('I Know This').click()

    await expectStudying(questions[2]!, 3, 40)
    expect(progressOf('card-02')).toBe(5)
    await studyButton('Previous').click()
    await expectStudying(questions[1]!, 2, 40)
    expect(studyProgress()).toBe('Mastered 5/5')
    await expect.element(studyButton('Already Mastered')).toBeDisabled()
  })

  it('credits I Know This from the answer side too, then shows the next question', async () => {
    await renderApp()
    await openStudy()
    for (let i = 0; i < 3; i++) await studyButton('Next').click()
    await expectStudying(questions[3]!, 4, 40) // card-04, 2/5

    await showAnswer().click()
    await expect.element(page.getByText(FIXTURE[3]!.answer)).toBeVisible()
    await studyButton('I Know This').click()

    await expectStudying(questions[4]!, 5, 40)
    expect(progressOf('card-04')).toBe(3)
  })

  it('adds one point per success, cumulatively, up to five', async () => {
    mockStore.reset(seedCards(1, 2))
    await renderApp()
    await openStudy()
    await expectStudying('Art Q1', 1, 1)

    for (const expected of ['3/5', '4/5', 'Mastered 5/5']) {
      await showAnswer().click()
      await studyButton('I Know This').click()
      // The only Card comes back, question side up.
      await expect.element(showAnswer()).toBeInTheDocument()
      await expect.poll(studyProgress).toBe(expected)
    }

    expect(progressOf('Art-1')).toBe(5)
    await expect.element(studyButton('Already Mastered')).toBeDisabled()
  })

  it('leaves Progress alone when revealing and navigating', async () => {
    await renderApp()
    await openStudy()

    await showAnswer().click()
    await studyButton('Next').click()
    await showAnswer().click()
    await studyButton('Previous').click()
    await studyButton('Previous').click()

    await expectStudying(questions[39]!, 40, 40)
    expect(FIXTURE.every((card) => progressOf(card.id) === card.progress)).toBe(
      true,
    )
    await expectStatistics(FIXTURE_STATISTICS)
  })
})

describe('Reset Progress', () => {
  it('resets only this Card, at once, and shows its question', async () => {
    await renderApp()
    await openStudy()
    await studyButton('Next').click()
    await showAnswer().click()

    await studyButton('Reset Progress').click()

    await expectStudying(questions[1]!, 2, 40)
    await expect.poll(studyProgress).toBe('0/5')
    expect(progressOf('card-02')).toBe(0)
    expect(progressOf('card-01')).toBe(5)
    await expect.element(studyButton('Reset Progress')).toBeDisabled()
    await expect.element(studyButton('I Know This')).toBeEnabled()
  })

  it('resets a Mastered Card, which can be credited again', async () => {
    await renderApp()
    await openStudy()

    await studyButton('Reset Progress').click()

    await expect.poll(studyProgress).toBe('0/5')
    await expectStudying(questions[0]!, 1, 40)
    await expect.element(studyButton('I Know This')).toBeEnabled()
  })

  it('is disabled at zero', async () => {
    await renderApp()
    await openStudy()
    for (let i = 0; i < 7; i++) await studyButton('Next').click()

    await expectStudying(questions[7]!, 8, 40) // card-08, 0/5
    await expect.element(studyButton('Reset Progress')).toBeDisabled()
  })
})

describe('navigating', () => {
  it('wraps at both ends, past the first page, always question side up', async () => {
    await renderApp()
    await openStudy()
    await showAnswer().click()

    await studyButton('Previous').click()
    await expectStudying(questions[39]!, 40, 40)
    await studyButton('Previous').click()
    await expectStudying(questions[38]!, 39, 40)
    await studyButton('Next').click()
    await showAnswer().click()
    await studyButton('Next').click()

    await expectStudying(questions[0]!, 1, 40)
  })

  it('visits every Card once, in the default order, across pages', async () => {
    await renderApp()
    await openStudy()

    const seen = [studyQuestion()]
    for (let i = 2; i <= 40; i++) {
      await studyButton('Next').click()
      await expectStudying(questions[i - 1]!, i, 40)
      seen.push(studyQuestion())
    }

    expect(seen).toEqual(questions)
  })

  it('disables Previous, Next and Shuffle when only one Card matches', async () => {
    mockStore.reset([...seedCards(1, 0), ...seedCards(2, 0, 'Music')])
    await renderApp()
    await openStudy()
    await expect.element(studyButton('Shuffle')).toBeEnabled()

    await toggleCategories('Art')

    await expectStudying('Art Q1', 1, 1)
    await expect.element(studyButton('Previous')).toBeDisabled()
    await expect.element(studyButton('Next')).toBeDisabled()
    await expect.element(studyButton('Shuffle')).toBeDisabled()
  })

  it('works from the keyboard: Tab to a control, Enter or Space to use it', async () => {
    await renderApp()
    await openStudy()

    showAnswer().element().focus()
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByText(FIXTURE[0]!.answer)).toBeVisible()
    await expect.element(showQuestion()).toHaveFocus()
    await userEvent.keyboard(' ')
    await expect.element(showAnswer()).toHaveFocus()

    studyButton('Next').element().focus()
    await userEvent.keyboard('{Enter}')
    await expectStudying(questions[1]!, 2, 40)
    // Enter on Next keeps focus there, for the next press.
    await expect.element(studyButton('Next')).toHaveFocus()

    await userEvent.tab({ shift: true })
    await expect.element(studyButton('Previous')).toHaveFocus()
    await userEvent.keyboard(' ')
    await expectStudying(questions[0]!, 1, 40)
  })
})

describe('filters', () => {
  it('match any chosen Category and restart at the first question', async () => {
    await renderApp()
    await openStudy()
    await studyButton('Next').click()

    await toggleCategories('Biology', 'History')

    const matching = FIXTURE.filter((card) =>
      ['Biology', 'History'].includes(card.category),
    )
    await expectStudying(matching[0]!.question, 1, matching.length)
    await studyButton('Next').click()
    await expectStudying(matching[1]!.question, 2, matching.length)

    // Clearing every Category means all of them again.
    await toggleCategories('Biology', 'History')
    await expectStudying(questions[0]!, 1, 40)
  })

  it('Hide Mastered leaves out Mastered Cards', async () => {
    await renderApp()
    await openStudy()

    await hideMastered().click()

    const unmastered = FIXTURE.filter((card) => card.progress < 5)
    await expectStudying(unmastered[0]!.question, 1, unmastered.length)
    await studyButton('Previous').click()
    await expectStudying(
      unmastered.at(-1)!.question,
      unmastered.length,
      unmastered.length,
    )
  })

  it('Hide Mastered drops a Card that becomes Mastered, and shows the next one', async () => {
    await renderApp()
    await openStudy()
    await hideMastered().click()
    const unmastered = FIXTURE.filter((card) => card.progress < 5)
    // card-02, at 4/5, comes first.
    await expectStudying(unmastered[0]!.question, 1, 32)

    await studyButton('I Know This').click()

    await expectStudying(unmastered[1]!.question, 1, 31)
    await studyButton('Previous').click()
    await expectStudying(unmastered.at(-1)!.question, 31, 31)
  })
})

describe('Shuffle', () => {
  const shuffled = (cards: typeof FIXTURE, seed: number) =>
    seededShuffle(cards, seed, (card) => card.id).map((card) => card.question)

  it('shuffles every matching Card and restarts at the first question', async () => {
    await renderApp({ seeds: [42] })
    await openStudy()
    await studyButton('Next').click()
    await showAnswer().click()

    await studyButton('Shuffle').click()

    const order = shuffled(FIXTURE, 42)
    await expectStudying(order[0]!, 1, 40)
    // With this seed, a Card from beyond the first page comes first.
    expect(questions.indexOf(order[0]!)).toBeGreaterThanOrEqual(12)
    await studyButton('Previous').click()
    await expectStudying(order[39]!, 40, 40)
  })

  it('keeps the shuffled order through navigation and scoring', async () => {
    await renderApp({ seeds: [7] })
    await openStudy()
    await studyButton('Shuffle').click()
    const order = shuffled(FIXTURE, 7)
    await expectStudying(order[0]!, 1, 40)

    for (let i = 1; i < 4; i++) {
      if (studyProgress() === 'Mastered 5/5') await studyButton('Next').click()
      else await studyButton('I Know This').click()
      await expectStudying(order[i]!, i + 1, 40)
    }
    await studyButton('Previous').click()
    await expectStudying(order[2]!, 3, 40)
  })

  it('a filter change restores the default order', async () => {
    await renderApp({ seeds: [42] })
    await openStudy()
    await studyButton('Shuffle').click()
    await expectStudying(shuffled(FIXTURE, 42)[0]!, 1, 40)

    await hideMastered().click()

    const unmastered = FIXTURE.filter((card) => card.progress < 5)
    await expectStudying(unmastered[0]!.question, 1, 32)
  })
})

describe('Study Mode and All Cards', () => {
  it('keep their own filters and order, and Study Mode starts afresh on each visit', async () => {
    await renderApp({ seeds: [42, 9] })
    await expectShowing(12, 40)
    await toggleCategories('Biology')
    await hideMastered().click()
    await page.getByRole('button', { name: 'Shuffle' }).click()

    await openStudy()
    await expectStudying(questions[0]!, 1, 40)
    await expect.element(hideMastered()).not.toBeChecked()

    await toggleCategories('History')
    await hideMastered().click()
    await studyButton('Shuffle').click()
    await studyButton('Next').click()
    await page.getByRole('link', { name: 'All Cards' }).click()
    await expectShowing(12, 40)
    await expect.element(hideMastered()).not.toBeChecked()

    await openStudy()
    await expectStudying(questions[0]!, 1, 40)
    await expect.element(hideMastered()).not.toBeChecked()
    await page.getByRole('button', { name: 'All Categories' }).click()
    await expect
      .element(page.getByRole('menuitemcheckbox', { name: /^History/ }))
      .not.toBeChecked()
  })
})
