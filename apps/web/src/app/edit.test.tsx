import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import type { ApiErrorBody } from '../api/types.js'
import { worker } from '../mocks/browser.js'
import { SCENARIOS } from '../mocks/scenarios.js'
import { seededShuffle } from '../domain/shuffle.js'
import { mockStore } from '../mocks/store.js'
import {
  cardList,
  cardTile,
  categoryMenuItems,
  editDialog,
  expectRevealed,
  expectShowing,
  fieldsIn,
  fillFields,
  FIXTURE,
  holdWrites,
  loadMore,
  openEdit,
  shownQuestions,
  toast,
  toggleCategories,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

const questions = FIXTURE.map((card) => card.question)
const countOf = (category: string) =>
  FIXTURE.filter((card) => card.category === category).length

/** card-02: Geography, 4 of 5 Progress, second in the default order. */
const CANBERRA = FIXTURE[1]!

/** A Card in the grid, by id, even while a modal hides the grid. */
const gridCard = (id: string) =>
  document.querySelector(`[data-card-id="${id}"]`)

const updateButton = () =>
  editDialog().getByRole('button', { name: /^Updat(e|ing) Card/ })
const discardDialog = () =>
  page.getByRole('alertdialog', { name: 'Discard your changes?' })

describe('editing a Card', () => {
  it('opens with the Card filled in', async () => {
    await renderApp()
    await expectShowing(12, 40)

    await openEdit(CANBERRA.question)

    const fields = fieldsIn(editDialog())
    await expect.element(fields.question).toHaveValue(CANBERRA.question)
    await expect.element(fields.answer).toHaveValue(CANBERRA.answer)
    await expect.element(fields.category).toHaveValue(CANBERRA.category)
    await expect.element(fields.question).toHaveFocus()
  })

  it('saves, closes, confirms, and keeps the Card in place with its Progress', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await openEdit(CANBERRA.question)

    await fillFields(editDialog(), {
      question: '  What is the capital city of Australia? ',
      answer: 'Canberra, since 1913.',
    })
    await updateButton().click()

    await expect.element(editDialog()).not.toBeInTheDocument()
    await expect.element(toast('Card updated successfully.')).toBeVisible()
    await expectShowing(12, 40)
    expect(shownQuestions()).toEqual([
      questions[0],
      'What is the capital city of Australia?',
      ...questions.slice(2, 12),
    ])
    const tile = cardTile('What is the capital city of Australia?')
    await expect.element(tile.getByText('Canberra, since 1913.')).toBeVisible()
    await expect
      .element(tile.getByRole('progressbar'))
      .toHaveAttribute('aria-valuenow', String(CANBERRA.progress))
    // Focus goes back to the Card's actions.
    await expect
      .element(tile.getByRole('button', { name: 'Card actions' }))
      .toHaveFocus()
  })

  it('keeps a Mastered Card Mastered', async () => {
    await renderApp()
    await expectShowing(12, 40)
    const mastered = FIXTURE[0]!

    await openEdit(mastered.question)
    await fillFields(editDialog(), { answer: 'The mitochondrion.' })
    await updateButton().click()

    await expect.element(toast('Card updated successfully.')).toBeVisible()
    const tile = cardTile(mastered.question)
    await expect.element(tile.getByText('The mitochondrion.')).toBeVisible()
    await expect.element(tile.getByText('Mastered 5/5')).toBeVisible()
  })

  it('moves the Card to an equivalent Category, updating the global counts', async () => {
    await renderApp()
    await expectShowing(12, 40)

    await openEdit(CANBERRA.question)
    await fillFields(editDialog(), { category: ' HISTORY  ' })
    await updateButton().click()

    await expect.element(toast('Card updated successfully.')).toBeVisible()
    await expect
      .element(cardTile(CANBERRA.question).getByText('History'))
      .toBeVisible()
    const items = await categoryMenuItems()
    expect(items).toContain(`History (${countOf('History') + 1})`)
    expect(items).toContain(`Geography (${countOf('Geography') - 1})`)
    expect(items).toHaveLength(6)
  })

  it('shows an error beside each blank field and keeps the dialog open', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await openEdit(CANBERRA.question)

    await fillFields(editDialog(), { answer: '  ', category: '' })
    await updateButton().click()

    const fields = fieldsIn(editDialog())
    await expect
      .element(fields.answer)
      .toHaveAccessibleDescription('Please enter an answer.')
    await expect
      .element(fields.category)
      .toHaveAccessibleDescription('Please enter a category.')
    await expect.element(fields.question).not.toHaveAttribute('aria-invalid')
    await expect.element(editDialog()).toBeVisible()
    expect(mockStore.getCard(CANBERRA.id)?.answer).toBe(CANBERRA.answer)
  })
})

describe('a failed edit', () => {
  it('keeps the dialog and the draft, explains, and succeeds on retry', async () => {
    worker.use(...SCENARIOS['edit-error']())
    await renderApp()
    await expectShowing(12, 40)
    await openEdit(CANBERRA.question)

    await fillFields(editDialog(), { answer: 'Canberra (ACT).' })
    await updateButton().click()

    await expect
      .element(editDialog().getByRole('alert'))
      .toHaveTextContent('Your card could not be saved. Please try again.')
    await expect
      .element(fieldsIn(editDialog()).answer)
      .toHaveValue('Canberra (ACT).')
    // Behind the modal, the grid is hidden from the accessibility tree.
    expect(gridCard(CANBERRA.id)?.textContent).toContain(CANBERRA.answer)

    await updateButton().click()

    await expect.element(editDialog()).not.toBeInTheDocument()
    await expect.element(toast('Card updated successfully.')).toBeVisible()
    await expect
      .element(cardTile(CANBERRA.question).getByText('Canberra (ACT).'))
      .toBeVisible()
  })

  it('explains when the Card no longer exists', async () => {
    worker.use(...SCENARIOS['edit-not-found']())
    await renderApp()
    await expectShowing(12, 40)
    await openEdit(CANBERRA.question)

    await fillFields(editDialog(), { answer: 'Canberra (ACT).' })
    await updateButton().click()

    await expect
      .element(editDialog().getByRole('alert'))
      .toHaveTextContent(
        'This card no longer exists, so it could not be saved.',
      )
    await expect
      .element(fieldsIn(editDialog()).answer)
      .toHaveValue('Canberra (ACT).')
  })

  it("shows the server's field errors beside the fields", async () => {
    worker.use(
      http.patch('/api/cards/:cardId', () =>
        HttpResponse.json<ApiErrorBody>(
          {
            code: 'validation_failed',
            message: 'The Card is invalid.',
            fieldErrors: { question: 'That question is not allowed.' },
          },
          { status: 400 },
        ),
      ),
    )
    await renderApp()
    await expectShowing(12, 40)
    await openEdit(CANBERRA.question)

    await updateButton().click()

    await expect
      .element(fieldsIn(editDialog()).question)
      .toHaveAccessibleDescription('That question is not allowed.')
  })
})

describe('a pending edit', () => {
  it('sends one request, and changes nothing until saved', async () => {
    const held = holdWrites('patch')
    worker.use(held.handler)
    await renderApp()
    await toggleCategories('Geography')
    await expectShowing(countOf('Geography'), countOf('Geography'))
    await openEdit(CANBERRA.question)

    await fillFields(editDialog(), { category: 'History' })
    await updateButton().click()

    const pending = editDialog().getByRole('button', {
      name: 'Updating Card…',
    })
    await expect.element(pending).toHaveAttribute('aria-disabled', 'true')
    await pending.click({ force: true })
    // Closing waits for the save too.
    await userEvent.keyboard('{Escape}')
    await expect.element(editDialog()).toBeVisible()
    await expect.element(discardDialog()).not.toBeInTheDocument()
    expect(held.requests()).toBe(1)
    // The Card leaves the Geography grid only once it is saved.
    expect(gridCard(CANBERRA.id)).not.toBeNull()
    await expectShowing(countOf('Geography'), countOf('Geography'))

    held.release()

    await expect.element(editDialog()).not.toBeInTheDocument()
    await expectShowing(countOf('Geography') - 1, countOf('Geography') - 1)
    await expect.element(cardTile(CANBERRA.question)).not.toBeInTheDocument()
    expect(held.requests()).toBe(1)
  })
})

describe('closing the edit dialog', () => {
  it('closes at once when nothing changed', async () => {
    await renderApp()
    await expectShowing(12, 40)

    await openEdit(CANBERRA.question)
    await editDialog().getByRole('button', { name: 'Close' }).click()
    await expect.element(editDialog()).not.toBeInTheDocument()

    await openEdit(CANBERRA.question)
    await userEvent.keyboard('{Escape}')
    await expect.element(editDialog()).not.toBeInTheDocument()
    await expect
      .element(
        cardTile(CANBERRA.question).getByRole('button', {
          name: 'Card actions',
        }),
      )
      .toHaveFocus()
    await expect.element(discardDialog()).not.toBeInTheDocument()
  })

  it.for([
    {
      path: 'the close button',
      close: () => editDialog().getByRole('button', { name: 'Close' }).click(),
    },
    { path: 'Escape', close: () => userEvent.keyboard('{Escape}') },
    {
      path: 'a click outside',
      close: () =>
        // The backdrop covers the page; click its top-left corner.
        userEvent.click(document.body, { position: { x: 4, y: 4 } }),
    },
  ])(
    'asks before discarding changes on $path, and Keep editing keeps them',
    async ({ close }) => {
      await renderApp()
      await expectShowing(12, 40)
      await openEdit(CANBERRA.question)
      await fillFields(editDialog(), { answer: 'Unsaved answer.' })

      await close()

      await expect.element(discardDialog()).toBeVisible()
      await expect
        .element(discardDialog().getByRole('button', { name: 'Keep editing' }))
        .toHaveFocus()
      await discardDialog()
        .getByRole('button', { name: 'Keep editing' })
        .click()

      await expect.element(discardDialog()).not.toBeInTheDocument()
      await expect.element(editDialog()).toBeVisible()
      await expect
        .element(fieldsIn(editDialog()).answer)
        .toHaveValue('Unsaved answer.')
      await expect
        .poll(() => editDialog().element().contains(document.activeElement))
        .toBe(true)

      await close()
      await discardDialog().getByRole('button', { name: 'Discard' }).click()

      await expect.element(editDialog()).not.toBeInTheDocument()
      await expect
        .element(cardTile(CANBERRA.question).getByText(CANBERRA.answer))
        .toBeVisible()
      expect(mockStore.getCard(CANBERRA.id)?.answer).toBe(CANBERRA.answer)
    },
  )

  it('Escape in the confirmation keeps editing', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await openEdit(CANBERRA.question)
    await fillFields(editDialog(), { question: 'Changed?' })

    await userEvent.keyboard('{Escape}')
    await expect.element(discardDialog()).toBeVisible()
    await userEvent.keyboard('{Escape}')

    await expect.element(discardDialog()).not.toBeInTheDocument()
    await expect.element(editDialog()).toBeVisible()
    await expect
      .element(fieldsIn(editDialog()).question)
      .toHaveValue('Changed?')
  })
})

describe('editing while browsing', () => {
  it('removes a Category when its last Card moves out, keeping other selections', async () => {
    mockStore.reset([
      {
        id: 'a',
        question: 'Q art',
        answer: 'A.',
        category: 'Art',
        progress: 1,
      },
      {
        id: 'm',
        question: 'Q music',
        answer: 'A.',
        category: 'Music',
        progress: 2,
      },
      {
        id: 's',
        question: 'Q sport',
        answer: 'A.',
        category: 'Sport',
        progress: 3,
      },
    ])
    await renderApp()
    await toggleCategories('Art', 'Sport')
    await expectShowing(2, 2)

    await openEdit('Q art')
    await fillFields(editDialog(), { category: 'music' })
    await updateButton().click()

    await expect
      .element(toast('Card updated successfully. Your filters hide it.'))
      .toBeVisible()
    await expectShowing(1, 1)
    expect(shownQuestions()).toEqual(['Q sport'])
    await page.getByRole('button', { name: 'All Categories' }).click()
    await expect
      .element(page.getByRole('menuitemcheckbox', { name: 'Sport (1)' }))
      .toBeChecked()
    await expect
      .element(page.getByRole('menuitemcheckbox', { name: 'Music (2)' }))
      .not.toBeChecked()
    expect(
      page
        .getByRole('menuitemcheckbox')
        .elements()
        .map((item) => item.textContent),
    ).toEqual(['Music (2)', 'Sport (1)'])
  })

  it('shows every Category when the only selected one is removed', async () => {
    mockStore.reset([
      {
        id: 'a',
        question: 'Q art',
        answer: 'A.',
        category: 'Art',
        progress: 1,
      },
      {
        id: 'm',
        question: 'Q music',
        answer: 'A.',
        category: 'Music',
        progress: 2,
      },
    ])
    await renderApp()
    await toggleCategories('Art')
    await expectShowing(1, 1)

    await openEdit('Q art')
    await fillFields(editDialog(), { category: 'Music' })
    await updateButton().click()

    // The Card is still on screen: no filter hides it any more.
    await expect.element(toast('Card updated successfully.')).toBeVisible()
    await expectShowing(2, 2)
    expect(await categoryMenuItems()).toEqual(['Music (2)'])
  })

  it('Show card reveals an edited Card beyond the first pages', async () => {
    await renderApp()
    await toggleCategories('Chemistry')
    await expectShowing(countOf('Chemistry'), countOf('Chemistry'))
    // card-36: Chemistry, 36th of 40 in the default order.
    const proton = FIXTURE[35]!

    await openEdit(proton.question)
    await fillFields(editDialog(), { category: 'Biology' })
    await updateButton().click()

    const notice = toast('Card updated successfully. Your filters hide it.')
    await expect.element(notice).toBeVisible()
    await expectShowing(countOf('Chemistry') - 1, countOf('Chemistry') - 1)
    await expect.element(cardTile(proton.question)).not.toBeInTheDocument()

    await notice.getByRole('button', { name: 'Show card' }).click()

    await expectShowing(36, 40)
    await expectRevealed(proton.question)
    expect(shownQuestions()).toEqual(questions.slice(0, 36))

    // Load More carries on from there.
    await loadMore()
    await expectShowing(40, 40)
  })

  it('Show card keeps a shuffled order and reveals the Card in it', async () => {
    await renderApp({ seeds: [42] })
    await expectShowing(12, 40)
    await page.getByRole('button', { name: 'Shuffle' }).click()
    const order = seededShuffle(FIXTURE, 42, (card) => card.id)
    await expect
      .poll(shownQuestions)
      .toEqual(order.slice(0, 12).map((card) => card.question))
    await toggleCategories('Mathematics')
    const maths = order.filter((card) => card.category === 'Mathematics')
    await expectShowing(maths.length, maths.length)
    // The Mathematics Card that comes last in the shuffled order.
    const target = maths.at(-1)!
    const position = order.indexOf(target)
    expect(position).toBeGreaterThanOrEqual(12)

    await openEdit(target.question)
    await fillFields(editDialog(), { category: 'Geography' })
    await updateButton().click()
    await toast('Card updated successfully. Your filters hide it.')
      .getByRole('button', { name: 'Show card' })
      .click()

    await expectRevealed(target.question)
    const shown = shownQuestions()
    expect(shown).toEqual(
      order.slice(0, shown.length).map((card) => card.question),
    )
    expect(shown.length).toBeGreaterThan(position)
  })

  it('stays coherent with Load More after an edit', async () => {
    await renderApp()
    await loadMore()
    await expectShowing(24, 40)

    await openEdit(questions[20]!)
    await fillFields(editDialog(), { question: 'Edited question?' })
    await updateButton().click()

    await expect.element(toast('Card updated successfully.')).toBeVisible()
    await expectShowing(24, 40)
    const expected = [...questions]
    expected[20] = 'Edited question?'
    expect(shownQuestions()).toEqual(expected.slice(0, 24))
    await loadMore()
    await expectShowing(36, 40)
    expect(shownQuestions()).toEqual(expected.slice(0, 36))
    expect(cardList().getByRole('article').elements()).toHaveLength(36)
  })
})
