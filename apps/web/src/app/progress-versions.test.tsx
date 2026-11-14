import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { createMockAuth } from '../auth/mock-auth.js'
import {
  IDEMPOTENCY_KEY_HEADER,
  progressFingerprint,
} from '../domain/idempotency.js'
import { IF_MATCH_HEADER, parseIfMatch } from '../domain/versions.js'
import { worker } from '../mocks/browser.js'
import { mockOwnerOf } from '../mocks/identity.js'
import {
  ELSEWHERE_PROGRESS,
  RATE_LIMITED_SECONDS,
  SCENARIOS,
} from '../mocks/scenarios.js'
import { mockBackend, mockStore } from '../mocks/store.js'
import {
  cardTile,
  createCard,
  createForm,
  expectStatistics,
  expectStudying,
  FIXTURE,
  holdWrites,
  openStudy,
  studyButton,
  studyCounter,
  studyProgress,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

/*
 * Progress saves across devices and retries (ADR 0003): their own version,
 * conflicts, lost responses, replays, the write rate limit, and accounts.
 */

const questions = FIXTURE.map((card) => card.question)
const progressOf = (id: string) => mockStore.getCard(id)?.progress

const alertSaying = (text: string) =>
  page.getByRole('alert').filter({ hasText: text })

/** Moves from the first Card to card-04 (2/5). */
async function studyCard04() {
  await openStudy()
  for (let i = 0; i < 3; i++) await studyButton('Next').click()
  await expectStudying(questions[3]!, 4, 40)
  expect(studyProgress()).toBe('2/5')
}

/**
 * A backend that applies the first Progress save but loses its response,
 * as when the connection drops on the way back. It records each request's
 * idempotency key.
 */
function loseFirstSaveResponse() {
  const keys: string[] = []
  worker.use(
    http.put('/api/cards/:cardId/progress', async ({ request, params }) => {
      const key = request.headers.get(IDEMPOTENCY_KEY_HEADER) ?? ''
      keys.push(key)
      if (keys.length > 1) return
      const cardId = String(params.cardId)
      const progressVersion = parseIfMatch(
        request.headers.get(IF_MATCH_HEADER),
      )!
      const { progress } = (await request.json()) as { progress: number }
      mockBackend
        .collectionOf(mockOwnerOf(request)!)
        .setProgressOnce(cardId, progress, {
          progressVersion,
          key,
          fingerprint: progressFingerprint(cardId, progressVersion, progress),
        })
      return HttpResponse.error()
    }),
  )
  return keys
}

describe('retrying a Progress save', () => {
  it('credits once when the first response was lost', async () => {
    const keys = loseFirstSaveResponse()
    await renderApp()
    await studyCard04()

    await studyButton('I Know This').click()

    const alert = alertSaying('You’re offline or the server can’t be reached.')
    await expect.element(alert).toBeVisible()
    expect(progressOf('card-04')).toBe(3)
    await alert.getByRole('button', { name: 'Retry' }).click()

    await expectStudying(questions[4]!, 5, 40)
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
    // Credited once, not twice.
    expect(progressOf('card-04')).toBe(3)
    expect(mockStore.getCard('card-04')?.progressVersion).toBe(2)
  })

  it('never shows a replayed result over newer Progress', async () => {
    loseFirstSaveResponse()
    await renderApp()
    await studyCard04()
    await studyButton('I Know This').click()
    const alert = alertSaying('Your progress could not be saved.')
    await expect.element(alert).toBeVisible()

    // Meanwhile, another device masters it.
    mockStore.setProgress('card-04', 5)
    await alert.getByRole('button', { name: 'Retry' }).click()

    // The retry is acknowledged (it did credit 3/5 back then)…
    await expectStudying(questions[4]!, 5, 40)
    await studyButton('Previous').click()
    // …but the screen shows what the backend holds now.
    await expectStudying(questions[3]!, 4, 40)
    expect(studyProgress()).toBe('Mastered 5/5')
  })

  it('uses a new key for the next save of the same Card', async () => {
    const keys: string[] = []
    worker.use(
      http.put('/api/cards/:cardId/progress', ({ request }) => {
        keys.push(request.headers.get(IDEMPOTENCY_KEY_HEADER) ?? '')
      }),
    )
    await renderApp()
    await studyCard04()

    await studyButton('Reset Progress').click()
    await expect.poll(studyProgress).toBe('0/5')
    await studyButton('I Know This').click()
    await expectStudying(questions[4]!, 5, 40)

    expect(keys).toHaveLength(2)
    expect(keys[1]).not.toBe(keys[0])
    expect(progressOf('card-04')).toBe(1)
  })
})

describe('a Progress save another device overtook', () => {
  it('explains the conflict, shows the latest Progress, and saves anew', async () => {
    worker.use(...SCENARIOS['progress-conflict'](mockStore))
    await renderApp()
    await studyCard04()

    await studyButton('I Know This').click()

    const alert = alertSaying(
      'This card’s progress was changed on another device.',
    )
    await expect.element(alert).toBeVisible()
    await expect
      .element(alert.getByRole('button', { name: 'Retry' }))
      .not.toBeInTheDocument()
    // The Card stays, now at what the other device saved.
    await expect.element(studyCounter()).toHaveTextContent('Card 4 of 40')
    await expect.poll(studyProgress).toBe(`${ELSEWHERE_PROGRESS}/5`)
    await expectStatistics({
      total: 40,
      notStarted: 9,
      inProgress: 23,
      mastered: 8,
    })

    await studyButton('I Know This').click()

    await expectStudying(questions[4]!, 5, 40)
    await expect.element(alert).not.toBeInTheDocument()
    expect(progressOf('card-04')).toBe(ELSEWHERE_PROGRESS + 1)
  })

  it("doesn't conflict with a content edit made elsewhere", async () => {
    await renderApp()
    await studyCard04()
    mockStore.updateCard('card-04', { answer: 'Edited on another device.' })

    await studyButton('I Know This').click()

    await expectStudying(questions[4]!, 5, 40)
    expect(mockStore.getCard('card-04')).toMatchObject({
      answer: 'Edited on another device.',
      progress: 3,
      contentVersion: 2,
    })
  })

  it('says so when the Card was deleted elsewhere, and never brings it back', async () => {
    await renderApp()
    await studyCard04()
    mockStore.deleteCard('card-04')

    await studyButton('I Know This').click()

    await expect
      .element(alertSaying('This card no longer exists.'))
      .toBeVisible()
    await expect.element(studyCounter()).toHaveTextContent('Card 4 of 39')
    expect(mockStore.getCard('card-04')).toBeUndefined()
  })
})

describe('the write rate limit', () => {
  it('says how long to wait when saving Progress, and Retry saves', async () => {
    worker.use(...SCENARIOS['rate-limited']())
    await renderApp()
    await studyCard04()

    await studyButton('I Know This').click()

    const alert = alertSaying(
      `Wait ${RATE_LIMITED_SECONDS} seconds, then try again.`,
    )
    await expect.element(alert).toBeVisible()
    expect(progressOf('card-04')).toBe(2)
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expectStudying(questions[4]!, 5, 40)
    expect(progressOf('card-04')).toBe(3)
  })

  it('says how long to wait when creating a Card', async () => {
    worker.use(...SCENARIOS['rate-limited']())
    await renderApp()

    await createCard({ question: 'Q?', answer: 'A.', category: 'C' })

    await expect
      .element(createForm().getByRole('alert'))
      .toHaveTextContent(
        `You’re making changes too quickly. Wait ${RATE_LIMITED_SECONDS} seconds, then try again.`,
      )
    await createForm().getByRole('button', { name: 'Create Card' }).click()
    await expect.element(cardTile('Q?')).toBeVisible()
  })
})

describe('Progress and accounts', () => {
  it("drops a save's late success once another account signs in, and replays nothing", async () => {
    const auth = createMockAuth()
    const held = holdWrites('put')
    worker.use(held.handler)
    await renderApp({ auth })
    await studyCard04()
    await studyButton('I Know This').click()
    await expect.element(page.getByText('Saving progress…')).toBeInTheDocument()

    auth.signIn('user_other')
    await expect
      .element(page.getByRole('heading', { name: 'No cards to study' }))
      .toBeVisible()
    held.release()

    // The demo account's save completes for the demo account…
    await expect.poll(() => progressOf('card-04')).toBe(3)
    // …and nothing of it reaches the other account's screen or backend.
    await expect
      .element(page.getByRole('heading', { name: 'No cards to study' }))
      .toBeVisible()
    expect(mockBackend.collectionOf('user_other').statistics([]).total).toBe(0)
    expect(held.requests()).toBe(1)
    await expectStatistics({
      total: 0,
      notStarted: 0,
      inProgress: 0,
      mastered: 0,
    })
  })

  it('asks for a fresh sign-in, and keeps the Progress, when the session has ended', async () => {
    worker.use(
      http.put('/api/cards/:cardId/progress', () =>
        HttpResponse.json(
          { code: 'unauthorized', message: 'Sign in to continue.' },
          { status: 401 },
        ),
      ),
    )
    await renderApp()
    await studyCard04()

    await studyButton('I Know This').click()

    const alert = alertSaying('Your session has ended.')
    await expect.element(alert).toBeVisible()
    await expect
      .element(alert.getByRole('button', { name: 'Retry' }))
      .not.toBeInTheDocument()
    expect(progressOf('card-04')).toBe(2)
  })
})
