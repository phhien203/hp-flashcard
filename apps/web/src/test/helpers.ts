import { http } from 'msw'
import { expect } from 'vitest'
import { page, userEvent, type Locator } from 'vitest/browser'

import fixture from '../mocks/fixtures/cards.json' with { type: 'json' }

/** The fixture the mock backend starts from: the tests' oracle. */
export const FIXTURE = fixture

export const cardList = () => page.getByRole('list', { name: 'Cards' })

/** The questions of the Cards on screen, in order. */
export const shownQuestions = () =>
  cardList()
    .getByRole('article')
    .elements()
    .map((article) => article.querySelector('p')?.textContent ?? '')

/** Waits for the live summary, e.g. "Showing 12 of 40 cards." */
export async function expectShowing(shown: number, total: number) {
  await expect
    .element(page.getByText(`Showing ${shown} of ${total} cards.`))
    .toBeInTheDocument()
}

export const loadMore = () =>
  page.getByRole('button', { name: 'Load More' }).click()

/** Ticks or unticks Categories in the All Categories menu, then closes it. */
export async function toggleCategories(...names: string[]) {
  await page.getByRole('button', { name: 'All Categories' }).click()
  for (const name of names) {
    await page
      .getByRole('menuitemcheckbox', { name: new RegExp(`^${name} \\(`) })
      .click()
  }
  await userEvent.keyboard('{Escape}')
  await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
}

export const hideMastered = (): Locator =>
  page.getByRole('checkbox', { name: 'Hide Mastered' })

/**
 * A handler that holds matching Card listings until `release()`, to see
 * loading states deterministically.
 */
export function holdCardRequests(matches: (offset: number) => boolean) {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  const handler = http.get('/api/cards', async ({ request }) => {
    const offset = Number(new URL(request.url).searchParams.get('offset'))
    if (matches(offset)) await released
    // Then fall through to the real handler.
  })
  return { handler, release }
}
