import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { seededShuffle } from '../mocks/shuffle.js'
import {
  expectShowing,
  FIXTURE,
  hideMastered,
  loadMore,
  shownQuestions,
  toggleCategories,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

const questions = FIXTURE.map((card) => card.question)

/** The questions of `cards` in the backend's order for `seed`. */
const shuffled = (cards: typeof FIXTURE, seed: number) =>
  seededShuffle(cards, seed, (card) => card.id).map((card) => card.question)
const shuffle = () => page.getByRole('button', { name: 'Shuffle' }).click()

describe('Shuffle', () => {
  it('shuffles the whole collection, not only the Cards on screen', async () => {
    await renderApp({ seeds: [42] })
    await expectShowing(12, 40)

    await shuffle()

    const expected = shuffled(FIXTURE, 42)
    await expect.poll(shownQuestions).toEqual(expected.slice(0, 12))
    await expectShowing(12, 40)
    // With this seed, Cards from beyond the first 12 come to the front.
    const firstTwelve = new Set(questions.slice(0, 12))
    expect(shownQuestions().some((q) => !firstTwelve.has(q))).toBe(true)
  })

  it('shows 12 Cards again after shuffling', async () => {
    await renderApp({ seeds: [42] })
    await loadMore()
    await expectShowing(24, 40)

    await shuffle()

    await expectShowing(12, 40)
  })

  it('keeps the shuffled order through Load More, without duplicates or omissions', async () => {
    await renderApp({ seeds: [42] })
    await expectShowing(12, 40)
    await shuffle()
    await expect
      .poll(shownQuestions)
      .toEqual(shuffled(FIXTURE, 42).slice(0, 12))

    await loadMore()
    await expectShowing(24, 40)
    await loadMore()
    await expectShowing(36, 40)
    await loadMore()
    await expectShowing(40, 40)

    const shown = shownQuestions()
    expect(shown).toEqual(shuffled(FIXTURE, 42))
    expect(new Set(shown).size).toBe(40)
    expect([...shown].sort()).toEqual([...questions].sort())
  })

  it('shuffles only the matching Cards and keeps the filters', async () => {
    await renderApp({ seeds: [3] })
    await toggleCategories('Programming')
    await hideMastered().click()
    const matching = FIXTURE.filter(
      (card) => card.category === 'Programming' && card.progress < 5,
    )
    await expectShowing(matching.length, matching.length)

    await shuffle()

    await expect.poll(shownQuestions).toEqual(shuffled(matching, 3))
    await expect.element(hideMastered()).toBeChecked()
  })

  it('reshuffles with a new seed each time', async () => {
    await renderApp({ seeds: [1, 2] })
    await shuffle()
    await expect.poll(shownQuestions).toEqual(shuffled(FIXTURE, 1).slice(0, 12))

    await shuffle()

    await expect.poll(shownQuestions).toEqual(shuffled(FIXTURE, 2).slice(0, 12))
  })
})
