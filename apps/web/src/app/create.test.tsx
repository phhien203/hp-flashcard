import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import type { ApiErrorBody } from '../api/types.js'
import { worker } from '../mocks/browser.js'
import { SCENARIOS } from '../mocks/scenarios.js'
import { seededShuffle } from '../mocks/shuffle.js'
import {
  cardTile,
  categoryMenuItems,
  createCard,
  createForm,
  expectShowing,
  fieldsIn,
  fillFields,
  FIXTURE,
  hideMastered,
  holdWrites,
  loadMore,
  shownQuestions,
  toast,
  expectRevealed,
  toggleCategories,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

const questions = FIXTURE.map((card) => card.question)
const countOf = (category: string) =>
  FIXTURE.filter((card) => card.category === category).length

const DNA = {
  question: 'What does DNA stand for?',
  answer: 'Deoxyribonucleic acid.',
  category: 'Biology',
}

const createButton = () =>
  createForm().getByRole('button', { name: /^Creat(e|ing) Card/ })

async function expectEmptyForm() {
  const fields = fieldsIn(createForm())
  await expect.element(fields.question).toHaveValue('')
  await expect.element(fields.answer).toHaveValue('')
  await expect.element(fields.category).toHaveValue('')
}

describe('creating a Card', () => {
  it('saves it first, at 0 of 5 Progress, clears the form and confirms', async () => {
    await renderApp()
    await expectShowing(12, 40)

    await createCard(DNA)

    await expect.element(toast('Card created successfully.')).toBeVisible()
    await expectShowing(12, 41)
    expect(shownQuestions()[0]).toBe(DNA.question)
    const tile = cardTile(DNA.question)
    await expect.element(tile.getByText(DNA.answer)).toBeVisible()
    await expect
      .element(tile.getByRole('progressbar', { name: 'Progress' }))
      .toHaveAttribute('aria-valuenow', '0')
    await expectEmptyForm()
  })

  it('trims surrounding whitespace', async () => {
    await renderApp()
    await expectShowing(12, 40)

    await createCard({
      question: `   ${DNA.question}  `,
      answer: `\n${DNA.answer}\t`,
      category: '  Biology ',
    })

    await expectShowing(12, 41)
    const tile = cardTile(DNA.question)
    await expect
      .element(tile.getByText(DNA.answer, { exact: true }))
      .toBeVisible()
    expect(shownQuestions()[0]).toBe(DNA.question)
  })

  it('shows an error beside each blank field and keeps what was typed', async () => {
    await renderApp()
    await expectShowing(12, 40)
    const fields = fieldsIn(createForm())

    await fillFields(createForm(), { question: '   ', answer: 'Kept.' })
    await createButton().click()

    await expect
      .element(fields.question)
      .toHaveAccessibleDescription('Please enter a question.')
    await expect
      .element(fields.question)
      .toHaveAttribute('aria-invalid', 'true')
    await expect
      .element(fields.category)
      .toHaveAccessibleDescription('Please enter a category.')
    await expect.element(fields.answer).not.toHaveAttribute('aria-invalid')
    await expect.element(fields.answer).toHaveValue('Kept.')
    await expectShowing(12, 40)

    // Typing into a field clears its error.
    await fields.question.fill('Fixed?')
    await expect.element(fields.question).not.toHaveAttribute('aria-invalid')
    await expect
      .element(fields.category)
      .toHaveAccessibleDescription('Please enter a category.')
  })

  it('allows a duplicate question', async () => {
    await renderApp()
    await expectShowing(12, 40)
    const existing = FIXTURE[3]!

    await createCard({
      question: existing.question,
      answer: 'Another answer.',
      category: 'History',
    })

    await expectShowing(12, 41)
    expect(
      shownQuestions().filter((q) => q === existing.question),
    ).toHaveLength(2)
  })

  it('reuses an equivalent Category, keeping its spelling, and updates the count', async () => {
    await renderApp()
    await expectShowing(12, 40)

    await createCard({ ...DNA, category: '  bIoLoGy ' })

    await expectShowing(12, 41)
    await expect
      .element(cardTile(DNA.question).getByText('Biology'))
      .toBeVisible()
    const items = await categoryMenuItems()
    expect(items).toContain(`Biology (${countOf('Biology') + 1})`)
    expect(items).toHaveLength(6)
  })

  it('creates a new Category when none matches', async () => {
    await renderApp()
    await expectShowing(12, 40)

    await createCard({ ...DNA, category: 'Genetics' })

    await expect.element(toast('Card created successfully.')).toBeVisible()
    expect(await categoryMenuItems()).toContain('Genetics (1)')
  })
})

describe('a failed create', () => {
  it('keeps the draft, explains, and succeeds on retry', async () => {
    worker.use(...SCENARIOS['create-error']())
    await renderApp()
    await expectShowing(12, 40)

    await createCard(DNA)

    await expect
      .element(createForm().getByRole('alert'))
      .toHaveTextContent('Your card could not be saved. Please try again.')
    await expect
      .element(fieldsIn(createForm()).question)
      .toHaveValue(DNA.question)
    await expectShowing(12, 40)
    expect(shownQuestions()).toEqual(questions.slice(0, 12))

    await createButton().click()

    await expect.element(toast('Card created successfully.')).toBeVisible()
    await expectShowing(12, 41)
    await expectEmptyForm()
    await expect
      .element(createForm().getByRole('alert'))
      .not.toBeInTheDocument()
  })

  it("shows the server's field errors beside the fields", async () => {
    worker.use(
      http.post('/api/cards', () =>
        HttpResponse.json<ApiErrorBody>(
          {
            code: 'validation_failed',
            message: 'The Card is invalid.',
            fieldErrors: { answer: 'The answer is too long.' },
          },
          { status: 400 },
        ),
      ),
    )
    await renderApp()
    await expectShowing(12, 40)

    await createCard(DNA)

    const fields = fieldsIn(createForm())
    await expect
      .element(fields.answer)
      .toHaveAccessibleDescription('The answer is too long.')
    await expect.element(fields.answer).toHaveValue(DNA.answer)
    await expect.element(fields.question).toHaveValue(DNA.question)
  })
})

describe('a pending create', () => {
  it('sends one request however often it is submitted, and changes nothing until saved', async () => {
    const held = holdWrites('post')
    worker.use(held.handler)
    await renderApp()
    await expectShowing(12, 40)

    await createCard(DNA)

    const pending = createForm().getByRole('button', { name: 'Creating Card…' })
    await expect.element(pending).toHaveAttribute('aria-disabled', 'true')
    await pending.click({ force: true })
    fieldsIn(createForm()).category.element().focus()
    await userEvent.keyboard('{Enter}')
    await expect
      .element(fieldsIn(createForm()).question)
      .toHaveAttribute('readonly')
    expect(held.requests()).toBe(1)
    // Nothing is shown before the backend has saved it.
    expect(shownQuestions()).toEqual(questions.slice(0, 12))
    await expect
      .element(fieldsIn(createForm()).question)
      .toHaveValue(DNA.question)

    held.release()

    await expect.element(toast('Card created successfully.')).toBeVisible()
    await expectShowing(12, 41)
    expect(held.requests()).toBe(1)
    expect(shownQuestions().filter((q) => q === DNA.question)).toHaveLength(1)
  })
})

describe('creating while browsing', () => {
  it('keeps the filters, and a matching Card shows first', async () => {
    await renderApp()
    await toggleCategories('Biology')
    await expectShowing(7, 7)

    await createCard(DNA)

    await expectShowing(8, 8)
    expect(shownQuestions()[0]).toBe(DNA.question)
    await expect.element(toast('Card created successfully.')).toBeVisible()
  })

  it('keeps the loaded count across Load More pages', async () => {
    await renderApp()
    await loadMore()
    await expectShowing(24, 40)

    await createCard(DNA)

    await expectShowing(24, 41)
    expect(shownQuestions()).toEqual([DNA.question, ...questions.slice(0, 23)])
  })

  it('keeps a shuffled order shuffled, slotting the new Card in', async () => {
    await renderApp({ seeds: [42] })
    await expectShowing(12, 40)
    await page.getByRole('button', { name: 'Shuffle' }).click()
    const before = seededShuffle(FIXTURE, 42, (card) => card.id).map(
      (card) => card.question,
    )
    await expect.poll(shownQuestions).toEqual(before.slice(0, 12))
    for (let shown = 24; shown <= 36; shown += 12) {
      await loadMore()
      await expectShowing(shown, 40)
    }
    await loadMore()
    await expectShowing(40, 40)

    await createCard(DNA)

    await expectShowing(41, 41)
    const after = shownQuestions()
    // The other Cards keep their shuffled order; the new one is among them.
    expect(after.filter((q) => q !== DNA.question)).toEqual(before)
    expect(after).toContain(DNA.question)
    expect(new Set(after).size).toBe(41)
  })

  it('explains when the filters hide the new Card, and Show card reveals it', async () => {
    await renderApp()
    await toggleCategories('History')
    await hideMastered().click()
    const history = FIXTURE.filter(
      (card) => card.category === 'History' && card.progress < 5,
    )
    await expectShowing(history.length, history.length)

    await createCard(DNA)

    const notice = toast('Card created successfully. Your filters hide it.')
    await expect.element(notice).toBeVisible()
    // The filters stay as they were.
    await expectShowing(history.length, history.length)
    await expect.element(hideMastered()).toBeChecked()

    await notice.getByRole('button', { name: 'Show card' }).click()

    await expectShowing(12, 41)
    await expect.element(hideMastered()).not.toBeChecked()
    await expect
      .element(page.getByRole('button', { name: 'All Categories' }))
      .toBeVisible()
    await expectRevealed(DNA.question)
    await expect.element(notice).not.toBeInTheDocument()
  })
})
