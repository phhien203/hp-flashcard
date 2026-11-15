import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { MAINTENANCE_NOTICE } from '../domain/maintenance.js'
import { worker } from '../mocks/browser.js'
import { SCENARIOS } from '../mocks/scenarios.js'
import {
  createCard,
  createForm,
  deleteButton,
  deleteDialog,
  expectShowing,
  fieldsIn,
  FIXTURE,
  openDelete,
  openStudy,
  studyButton,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

/*
 * A database recovery closes the API (docs/web-recovery.md): every request
 * answers 503 `maintenance`. The app says so, keeps what was typed, and
 * never reports a write as saved.
 */

const maintenanceNotice = () =>
  page.getByRole('status').filter({ hasText: MAINTENANCE_NOTICE.title })

const NEW_CARD = {
  question: 'What is the powerhouse of the cell?',
  answer: 'The mitochondrion.',
  category: 'Biology',
}

describe('maintenance', () => {
  it('explains why nothing loads, and recovers on Retry once it is over', async () => {
    worker.use(...SCENARIOS.maintenance())
    await renderApp()

    await expect.element(maintenanceNotice()).toBeVisible()
    await expect
      .element(maintenanceNotice().getByText(MAINTENANCE_NOTICE.description))
      .toBeVisible()
    await expect
      .element(page.getByText('Cards could not be loaded.'))
      .toBeVisible()

    // The operator reopens the API.
    worker.resetHandlers()
    await page.getByRole('button', { name: 'Retry' }).first().click()
    await page.getByRole('button', { name: 'Retry' }).click()

    await expectShowing(12, 40)
    await expect.element(maintenanceNotice()).not.toBeInTheDocument()
  })

  it('keeps a new card unsaved, and says it was not saved', async () => {
    await renderApp()
    await expectShowing(12, 40)
    worker.use(...SCENARIOS['maintenance-writes']())

    await createCard(NEW_CARD)

    await expect
      .element(createForm().getByRole('alert'))
      .toHaveTextContent(
        'Flashcard is down for maintenance, so your card was not saved. Try again in a few minutes.',
      )
    await expect
      .element(fieldsIn(createForm()).question)
      .toHaveValue(NEW_CARD.question)
    await expectShowing(12, 40)
  })

  it('keeps a card it could not delete, and says so', async () => {
    await renderApp()
    await expectShowing(12, 40)
    worker.use(...SCENARIOS['maintenance-writes']())
    const question = FIXTURE[0]!.question

    await openDelete(question)
    await deleteButton().click()

    await expect
      .element(deleteDialog().getByRole('alert'))
      .toHaveTextContent(
        'Flashcard is down for maintenance, so your card was not deleted. Try again in a few minutes.',
      )
    await expectShowing(12, 40)
  })

  it('keeps the previous Progress when a save is refused', async () => {
    await renderApp()
    await openStudy()
    worker.use(...SCENARIOS['maintenance-writes']())

    await studyButton('Reset Progress').click()

    await expect
      .element(
        page
          .getByRole('alert')
          .getByText(
            'Flashcard is down for maintenance. The card keeps its previous progress; try again in a few minutes.',
          ),
      )
      .toBeVisible()
  })
})
