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

/** The create form at the top of All Cards. */
export const createForm = () =>
  page.getByRole('form', { name: 'Create a card' })

/** The "Edit your card" dialog. */
export const editDialog = () =>
  page.getByRole('dialog', { name: 'Edit your card' })

/** The Question, Answer and Category fields inside `scope`. */
export const fieldsIn = (scope: Locator) => ({
  question: scope.getByRole('textbox', { name: 'Question' }),
  answer: scope.getByRole('textbox', { name: 'Answer' }),
  category: scope.getByRole('textbox', { name: 'Category' }),
})

export interface CardText {
  question: string
  answer: string
  category: string
}

/** Replaces what the fields in `scope` hold with `values`. */
export async function fillFields(scope: Locator, values: Partial<CardText>) {
  const fields = fieldsIn(scope)
  for (const name of ['question', 'answer', 'category'] as const) {
    const value = values[name]
    if (value !== undefined) await fields[name].fill(value)
  }
}

/** Fills the create form and presses Create Card. */
export async function createCard(values: CardText) {
  await fillFields(createForm(), values)
  await createForm().getByRole('button', { name: 'Create Card' }).click()
}

/** A Card in the grid, by its question. */
export const cardTile = (question: string) =>
  cardList().getByRole('article', { name: question })

/** Opens the edit dialog of the Card with this question. */
export async function openEdit(question: string) {
  await cardTile(question).getByRole('button', { name: 'Card actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await expect.element(editDialog()).toBeVisible()
}

/** A toast, by its message. */
export const toast = (title: string) =>
  page.getByRole('dialog', { name: title })

/** The All Categories menu's items, e.g. "Biology (7)", read and closed. */
export async function categoryMenuItems() {
  await page.getByRole('button', { name: 'All Categories' }).click()
  const items = page.getByRole('menuitemcheckbox')
  await expect.element(items.first()).toBeVisible()
  const texts = items.elements().map((item) => item.textContent ?? '')
  await userEvent.keyboard('{Escape}')
  await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
  return texts
}

/**
 * A handler that holds Card writes (`post` creates, `patch` edits, `delete`
 * deletes) until `release()`, to see pending states deterministically. It
 * counts them.
 */
export function holdWrites(method: 'post' | 'patch' | 'delete') {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  const counter = { count: 0 }
  const path = method === 'post' ? '/api/cards' : '/api/cards/:cardId'
  const handler = http[method](path, async () => {
    counter.count++
    await released
    // Then fall through to the real handler.
  })
  return { handler, release, requests: () => counter.count }
}

/** Waits until "Show card" has brought this Card into view and focus. */
export async function expectRevealed(question: string) {
  await expect
    .poll(() => document.activeElement?.contains(cardTile(question).query()))
    .toBe(true)
  await expect.element(cardTile(question)).toBeInViewport()
}

/** The "Delete this card?" confirmation. */
export const deleteDialog = () =>
  page.getByRole('alertdialog', { name: 'Delete this card?' })

/** The confirmation's Delete Card button, also while it is pending. */
export const deleteButton = () =>
  deleteDialog().getByRole('button', { name: /^Delet(e|ing) Card/ })

/** Opens the delete confirmation of the Card with this question. */
export async function openDelete(question: string) {
  await cardTile(question).getByRole('button', { name: 'Card actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect.element(deleteDialog()).toBeVisible()
}

/** Deletes the Card with this question, and waits for the confirmation. */
export async function deleteCard(question: string) {
  await openDelete(question)
  await deleteButton().click()
  await expect.element(deleteDialog()).not.toBeInTheDocument()
  // Earlier deletions' toasts may still be showing.
  await expect.element(toast('Card deleted successfully.').last()).toBeVisible()
  await expect.element(cardTile(question)).not.toBeInTheDocument()
}
