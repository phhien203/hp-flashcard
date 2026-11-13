import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { mockStore } from '../mocks/store.js'
import {
  cardTile,
  createCard,
  createForm,
  editDialog,
  expectShowing,
  fieldsIn,
  fillFields,
  FIXTURE,
  openEdit,
  shownQuestions,
  toast,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

const studyLink = () => page.getByRole('link', { name: 'Study Mode' })
const allCardsLink = () => page.getByRole('link', { name: 'All Cards' })
const studyHeading = () =>
  page.getByRole('heading', { name: 'Study Mode', level: 1 })
const leaveDialog = () =>
  page.getByRole('alertdialog', { name: 'Leave without creating the card?' })

const DNA = {
  question: 'What does DNA stand for?',
  answer: 'Deoxyribonucleic acid.',
  category: 'Biology',
}

describe('leaving with an unfinished Card', () => {
  it('asks first; Stay keeps the draft', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await fillFields(createForm(), { question: 'Half-written?' })

    await studyLink().click()

    await expect.element(leaveDialog()).toBeVisible()
    await expect
      .element(leaveDialog().getByRole('button', { name: 'Stay' }))
      .toHaveFocus()
    await leaveDialog().getByRole('button', { name: 'Stay' }).click()

    await expect.element(leaveDialog()).not.toBeInTheDocument()
    await expect.element(studyHeading()).not.toBeInTheDocument()
    await expect
      .element(fieldsIn(createForm()).question)
      .toHaveValue('Half-written?')
    await expect.element(studyLink()).toHaveFocus()
  })

  it('Discard and leave goes, and All Cards starts afresh on return', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await fillFields(createForm(), { answer: 'An answer.' })

    await studyLink().click()
    await leaveDialog()
      .getByRole('button', { name: 'Discard and leave' })
      .click()

    await expect.element(studyHeading()).toBeVisible()
    await allCardsLink().click()
    await expectShowing(12, 40)
    const fields = fieldsIn(createForm())
    await expect.element(fields.question).toHaveValue('')
    await expect.element(fields.answer).toHaveValue('')
    await expect.element(fields.category).toHaveValue('')
  })

  it('works from the keyboard, where Escape stays', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await fillFields(createForm(), { category: 'Art' })

    studyLink().element().focus()
    await userEvent.keyboard('{Enter}')
    await expect.element(leaveDialog()).toBeVisible()
    await userEvent.keyboard('{Escape}')

    await expect.element(leaveDialog()).not.toBeInTheDocument()
    await expect.element(fieldsIn(createForm()).category).toHaveValue('Art')

    studyLink().element().focus()
    await userEvent.keyboard('{Enter}')
    // Opening the dialog schedules its initial focus asynchronously.
    await expect
      .element(leaveDialog().getByRole('button', { name: 'Stay' }))
      .toHaveFocus()
    await userEvent.tab()
    await expect
      .element(leaveDialog().getByRole('button', { name: 'Discard and leave' }))
      .toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect.element(studyHeading()).toBeVisible()
  })

  it('does not ask when the form is empty or only whitespace', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await fillFields(createForm(), { question: '   ' })

    await studyLink().click()

    await expect.element(studyHeading()).toBeVisible()
    await expect.element(leaveDialog()).not.toBeInTheDocument()
  })

  it('does not ask once the Card is created', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await createCard(DNA)
    await expect.element(toast('Card created successfully.')).toBeVisible()

    await studyLink().click()

    await expect.element(studyHeading()).toBeVisible()
  })
})

describe('saved Cards', () => {
  it('survive navigation; view state does not', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await createCard(DNA)
    await expectShowing(12, 41)
    await openEdit(FIXTURE[1]!.question)
    await fillFields(editDialog(), { answer: 'Canberra, ACT.' })
    await editDialog().getByRole('button', { name: 'Update Card' }).click()
    await expect.element(toast('Card updated successfully.')).toBeVisible()

    await studyLink().click()
    await expect.element(studyHeading()).toBeVisible()
    await allCardsLink().click()

    await expectShowing(12, 41)
    expect(shownQuestions()[0]).toBe(DNA.question)
    await expect
      .element(cardTile(FIXTURE[1]!.question).getByText('Canberra, ACT.'))
      .toBeVisible()
  })

  it('are never written to browser storage', async () => {
    localStorage.clear()
    sessionStorage.clear()
    await renderApp()
    await expectShowing(12, 40)

    await createCard(DNA)
    await expectShowing(12, 41)

    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('are back to the fixture after a browser refresh, unlike a remount', async () => {
    const first = await renderApp()
    await expectShowing(12, 40)
    await createCard(DNA)
    await expectShowing(12, 41)

    // A remount (a fresh app and QueryClient on the same page) still sees
    // the mock backend's saved Cards…
    await first.unmount()
    const second = await renderApp()
    await expectShowing(12, 41)
    await second.unmount()

    // …while a refresh loads the mock backend afresh, from the fixture, as
    // the store does when its module is evaluated on page load.
    mockStore.reset()
    await renderApp()
    await expectShowing(12, 40)
    expect(shownQuestions()).toEqual(
      FIXTURE.slice(0, 12).map((card) => card.question),
    )
  })
})
