import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { createMockAuth } from '../auth/mock-auth.js'
import {
  editFingerprint,
  IDEMPOTENCY_KEY_HEADER,
} from '../domain/idempotency.js'
import { IF_MATCH_HEADER, parseIfMatch } from '../domain/versions.js'
import { worker } from '../mocks/browser.js'
import { mockOwnerOf } from '../mocks/identity.js'
import { versionConflict } from '../mocks/handlers.js'
import { ELSEWHERE_ANSWER, SCENARIOS } from '../mocks/scenarios.js'
import { MOCK_DEMO_USER, mockBackend, mockStore } from '../mocks/store.js'
import {
  cardTile,
  deleteButton,
  deleteDialog,
  editDialog,
  expectShowing,
  fieldsIn,
  fillFields,
  FIXTURE,
  holdWrites,
  openDelete,
  openEdit,
  toast,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

/** card-02: Geography, second in the default order. */
const CANBERRA = FIXTURE[1]!

const updateButton = () =>
  editDialog().getByRole('button', { name: /^Updat(e|ing) Card/ })
const conflictReview = () =>
  editDialog().getByRole('alert').filter({ hasText: 'another device' })
const signInHeading = () =>
  page.getByRole('heading', { name: 'Sign in to your flashcards' })

/** Opens Canberra's edit dialog and changes its answer to `answer`. */
async function editCanberra(answer: string) {
  await expectShowing(12, FIXTURE.length)
  await openEdit(CANBERRA.question)
  await fillFields(editDialog(), { answer })
}

/** Records the idempotency key and `If-Match` of every edit. */
function recordEdits() {
  const sent: { key: string | null; version: number | undefined }[] = []
  worker.use(
    http.patch('/api/cards/:cardId', ({ request }) => {
      sent.push({
        key: request.headers.get(IDEMPOTENCY_KEY_HEADER),
        version: parseIfMatch(request.headers.get(IF_MATCH_HEADER)),
      })
    }),
  )
  return sent
}

/** The first edit commits, but its response never arrives. */
function loseFirstEditResponse() {
  let lost = false
  worker.use(
    http.patch('/api/cards/:cardId', async ({ request, params }) => {
      if (lost) return
      lost = true
      const cardId = String(params.cardId)
      const body = (await request.json()) as Record<string, string>
      const contentVersion = parseIfMatch(request.headers.get(IF_MATCH_HEADER))!
      mockBackend
        .collectionOf(mockOwnerOf(request)!)
        .updateCardOnce(cardId, body, {
          contentVersion,
          key: request.headers.get(IDEMPOTENCY_KEY_HEADER)!,
          fingerprint: editFingerprint(cardId, contentVersion, body),
        })
      return HttpResponse.error()
    }),
  )
}

describe('an edit another device has overtaken', () => {
  it('shows the latest version, and keeps my changes to save over it', async () => {
    worker.use(...SCENARIOS['edit-conflict'](mockStore))
    const sent = recordEdits()
    await renderApp()
    await editCanberra('Mine.')
    await updateButton().click()

    await expect.element(conflictReview()).toBeVisible()
    await expect
      .element(conflictReview().getByText(ELSEWHERE_ANSWER))
      .toBeVisible()
    // My changes are still in the form, and can't be saved unreviewed.
    await expect.element(fieldsIn(editDialog()).answer).toHaveValue('Mine.')
    await expect
      .element(updateButton())
      .toHaveAttribute('aria-disabled', 'true')
    // Behind the dialog, the grid has refreshed to the latest version.
    await expect
      .poll(
        () =>
          document.querySelector(`[data-card-id="${CANBERRA.id}"]`)
            ?.textContent,
      )
      .toContain(ELSEWHERE_ANSWER)

    await conflictReview()
      .getByRole('button', { name: 'Keep my changes' })
      .click()
    await expect.element(conflictReview()).not.toBeInTheDocument()
    await updateButton().click()

    await expect.element(toast('Card updated successfully.')).toBeVisible()
    await expect
      .element(cardTile(CANBERRA.question).getByText('Mine.'))
      .toBeVisible()
    expect(sent.map((s) => s.version)).toEqual([1, 2])
    expect(sent[1]!.key).not.toBe(sent[0]!.key)
    expect(mockStore.getCard(CANBERRA.id)).toMatchObject({
      answer: 'Mine.',
      contentVersion: 3,
    })
  })

  it('can take the latest version instead, discarding my changes', async () => {
    worker.use(...SCENARIOS['edit-conflict'](mockStore))
    await renderApp()
    await editCanberra('Mine.')
    await updateButton().click()

    await conflictReview()
      .getByRole('button', { name: 'Use the latest version' })
      .click()

    await expect
      .element(fieldsIn(editDialog()).answer)
      .toHaveValue(ELSEWHERE_ANSWER)
    // Nothing unsaved is left: closing doesn't ask.
    await editDialog().getByRole('button', { name: 'Close' }).click()
    await expect.element(editDialog()).not.toBeInTheDocument()
    expect(mockStore.getCard(CANBERRA.id)?.answer).toBe(ELSEWHERE_ANSWER)
  })

  it('says when another device deleted the Card, keeping my changes on screen', async () => {
    worker.use(
      http.patch('/api/cards/:cardId', ({ params }) => {
        mockStore.deleteCard(String(params.cardId))
        return versionConflict()
      }),
    )
    await renderApp()
    await editCanberra('Mine.')
    await updateButton().click()

    await expect
      .element(editDialog().getByRole('alert'))
      .toHaveTextContent(
        'This card was deleted on another device, so your changes can’t be saved.',
      )
    await expect.element(fieldsIn(editDialog()).answer).toHaveValue('Mine.')
    expect(mockStore.getCard(CANBERRA.id)).toBeUndefined()
  })
})

describe('a deletion another device has overtaken', () => {
  it('deletes nothing until the latest version is confirmed', async () => {
    worker.use(...SCENARIOS['delete-conflict'](mockStore))
    await renderApp()
    await expectShowing(12, FIXTURE.length)
    await openDelete(CANBERRA.question)

    await deleteButton().click()

    await expect
      .element(
        deleteDialog()
          .getByRole('alert')
          .getByText(/^This card was changed on another device/),
      )
      .toBeVisible()
    await expect
      .element(deleteDialog().getByText(ELSEWHERE_ANSWER))
      .toBeVisible()
    expect(mockStore.getCard(CANBERRA.id)).toBeDefined()

    await deleteButton().click()
    await expect.element(deleteDialog()).not.toBeInTheDocument()
    await expect.element(toast('Card deleted successfully.')).toBeVisible()
    await expectShowing(12, FIXTURE.length - 1)
    expect(mockStore.getCard(CANBERRA.id)).toBeUndefined()
  })
})

describe('retrying after a lost response', () => {
  it('acknowledges the edit once, without showing it over a newer one', async () => {
    loseFirstEditResponse()
    const sent = recordEdits()
    await renderApp()
    await editCanberra('Mine.')
    await updateButton().click()
    await expect
      .element(
        editDialog()
          .getByRole('alert')
          .getByText(/you’re offline or the server can’t be reached/),
      )
      .toBeVisible()

    // Meanwhile, another device edits the Card again.
    mockStore.updateCard(CANBERRA.id, { answer: 'Newer, elsewhere.' })
    await updateButton().click()

    await expect.element(toast('Card updated successfully.')).toBeVisible()
    // The replayed result is history: the grid shows the newer answer.
    await expect
      .element(cardTile(CANBERRA.question).getByText('Newer, elsewhere.'))
      .toBeVisible()
    await expect
      .element(cardTile(CANBERRA.question).getByText('Mine.'))
      .not.toBeInTheDocument()
    expect(sent).toHaveLength(2)
    expect(sent[1]).toEqual(sent[0])
    expect(mockStore.getCard(CANBERRA.id)?.contentVersion).toBe(3)
  })
})

describe('offline', () => {
  it('fails the save at once, keeps the draft, and queues nothing', async () => {
    let edits = 0
    worker.use(
      http.patch('/api/cards/:cardId', () => {
        edits++
        return HttpResponse.error()
      }),
    )
    await renderApp()
    await editCanberra('Mine.')
    await updateButton().click()

    await expect
      .element(editDialog().getByRole('alert'))
      .toHaveTextContent(
        'Your card could not be saved: you’re offline or the server can’t be reached. Check your connection and try again.',
      )
    await expect.element(fieldsIn(editDialog()).answer).toHaveValue('Mine.')
    await expect
      .element(updateButton())
      .toHaveAttribute('aria-disabled', 'false')
    // Coming back online doesn't resend it.
    window.dispatchEvent(new Event('online'))
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(edits).toBe(1)
    expect(mockStore.getCard(CANBERRA.id)?.answer).toBe(CANBERRA.answer)
  })
})

describe('an edit across signing in again', () => {
  it('gives the same account its unsaved edit back, to retry with the same key', async () => {
    const auth = createMockAuth()
    loseFirstEditResponse()
    const sent = recordEdits()
    await renderApp({ auth })
    await editCanberra('Mine.')
    await updateButton().click()
    await expect.element(editDialog().getByRole('alert')).toBeVisible()

    // The session ends (it expired) without signing out…
    auth.signOut()
    await expect.element(signInHeading()).toBeVisible()
    // …and the same account signs in again.
    auth.signIn(MOCK_DEMO_USER)

    await expect.element(editDialog()).toBeVisible()
    await expect.element(fieldsIn(editDialog()).answer).toHaveValue('Mine.')
    await expect
      .element(
        editDialog()
          .getByRole('status')
          .getByText(/^Your session ended before this card was saved\./),
      )
      .toBeVisible()
    expect(sent).toHaveLength(1)

    await updateButton().click()
    await expect.element(toast('Card updated successfully.')).toBeVisible()
    // The retry repeated the key: the edit applied once.
    expect(sent).toHaveLength(2)
    expect(sent[1]).toEqual(sent[0])
    expect(mockStore.getCard(CANBERRA.id)).toMatchObject({
      answer: 'Mine.',
      contentVersion: 2,
    })
  })

  it('gives the edit back once: returning to All Cards later opens nothing', async () => {
    const auth = createMockAuth()
    await renderApp({ auth })
    await editCanberra('Mine.')

    auth.signOut()
    await expect.element(signInHeading()).toBeVisible()
    auth.signIn(MOCK_DEMO_USER)
    await expect.element(editDialog()).toBeVisible()
    await updateButton().click()
    await expect.element(toast('Card updated successfully.')).toBeVisible()
    await expect.element(editDialog()).not.toBeInTheDocument()

    await page.getByRole('link', { name: 'Study Mode' }).click()
    await page.getByRole('link', { name: 'All Cards' }).click()
    await expectShowing(12, FIXTURE.length)
    await expect.element(editDialog()).not.toBeInTheDocument()
  })

  it('gives another account nothing, and forgets the edit', async () => {
    const auth = createMockAuth()
    await renderApp({ auth })
    await editCanberra('Mine.')

    auth.signOut()
    await expect.element(signInHeading()).toBeVisible()
    auth.signIn('user_other')
    await expect.element(page.getByText('No cards yet.')).toBeVisible()
    await expect.element(editDialog()).not.toBeInTheDocument()

    auth.signIn(MOCK_DEMO_USER)
    await expectShowing(12, FIXTURE.length)
    await expect.element(editDialog()).not.toBeInTheDocument()
  })

  it('forgets the edit when the account switches mid-save, and the late response changes nothing', async () => {
    const auth = createMockAuth()
    const held = holdWrites('patch')
    worker.use(held.handler)
    await renderApp({ auth })
    await editCanberra('Mine.')
    await updateButton().click()
    await expect.element(updateButton()).toHaveTextContent('Updating Card…')

    auth.signIn('user_other')
    await expect.element(page.getByText('No cards yet.')).toBeVisible()
    held.release()
    // The demo account's save still lands in the demo Collection…
    await expect
      .poll(() => mockStore.getCard(CANBERRA.id)?.answer)
      .toBe('Mine.')
    // …but nothing of it reaches this account's screen.
    await expect.element(page.getByText('No cards yet.')).toBeVisible()
    await expect.element(editDialog()).not.toBeInTheDocument()
    await expect
      .element(toast('Card updated successfully.'))
      .not.toBeInTheDocument()
  })
})

describe('refreshing', () => {
  it("shows another device's changes on returning to the window", async () => {
    await renderApp()
    await expectShowing(12, FIXTURE.length)
    mockStore.updateCard(CANBERRA.id, { answer: 'Changed elsewhere.' })

    window.dispatchEvent(new Event('visibilitychange'))

    await expect
      .element(cardTile(CANBERRA.question).getByText('Changed elsewhere.'))
      .toBeVisible()
  })
})
