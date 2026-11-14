import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { createMockAuth } from '../auth/mock-auth.js'
import { CARD_QUOTA, MAX_LENGTHS, type CardText } from '../domain/card-text.js'
import {
  creationFingerprint,
  IDEMPOTENCY_KEY_HEADER,
} from '../domain/idempotency.js'
import { worker } from '../mocks/browser.js'
import { mockOwnerOf } from '../mocks/identity.js'
import { serverError } from '../mocks/scenarios.js'
import { mockBackend, mockStore } from '../mocks/store.js'
import {
  cardTile,
  createCard,
  createForm,
  expectShowing,
  fieldsIn,
  FIXTURE,
  holdCardRequests,
  toast,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

const DNA = {
  question: 'What does DNA stand for?',
  answer: 'Deoxyribonucleic acid.',
  category: 'Biology',
}

const signInHeading = () =>
  page.getByRole('heading', { name: 'Sign in to your flashcards' })
const signOut = () => page.getByRole('button', { name: 'Sign out' }).click()
const expectEmptyCollection = () =>
  expect.element(page.getByText('No cards yet.')).toBeVisible()
const createButton = () =>
  createForm().getByRole('button', { name: /^Creat(e|ing) Card/ })

describe('signing in', () => {
  it('shows the sign-in to a signed-out visitor, and no Cards', async () => {
    await renderApp({ auth: createMockAuth(null) })

    await expect.element(signInHeading()).toBeVisible()
    await expect
      .element(
        page.getByRole('button', { name: 'Continue as the demo account' }),
      )
      .toBeVisible()
    await expect
      .element(page.getByRole('list', { name: 'Cards' }))
      .not.toBeInTheDocument()
    await expect
      .element(page.getByRole('link', { name: 'Study Mode' }))
      .not.toBeInTheDocument()
  })

  it('says it is loading while the session is unknown', async () => {
    const auth = createMockAuth(null)
    auth.setLoading()
    await renderApp({ auth })

    await expect.element(page.getByRole('status')).toHaveTextContent('Loading…')
    await expect.element(signInHeading()).not.toBeInTheDocument()
  })

  it('opens the Collection once signed in, and the sign-in once signed out', async () => {
    await renderApp({ auth: createMockAuth(null) })
    await page
      .getByRole('button', { name: 'Continue as the demo account' })
      .click()
    await expectShowing(12, FIXTURE.length)

    await signOut()
    await expect.element(signInHeading()).toBeVisible()
  })

  it('gives a new account an empty Collection to start', async () => {
    await renderApp({ auth: createMockAuth('user_new') })
    await expectEmptyCollection()
  })
})

describe('a private Collection', () => {
  it("keeps a new account's Card after a reload", async () => {
    const auth = createMockAuth('user_new')
    const first = await renderApp({ auth })
    await expectEmptyCollection()
    await createCard(DNA)
    await expect.element(toast('Card created successfully.')).toBeVisible()
    await expectShowing(1, 1)

    // A reload: a fresh app and query cache, the same backend and account.
    await first.unmount()
    await renderApp({ auth })
    await expectShowing(1, 1)
    await expect.element(cardTile(DNA.question)).toBeVisible()
  })

  it("never shows one account's Cards to the next account", async () => {
    const auth = createMockAuth()
    await renderApp({ auth })
    await expectShowing(12, FIXTURE.length)

    await signOut()
    auth.signIn('user_other')
    await expectEmptyCollection()
    await expect.element(cardTile(FIXTURE[0]!.question)).not.toBeInTheDocument()

    await createCard(DNA)
    await expectShowing(1, 1)
    auth.signIn('user_demo_again_is_another_account')
    await expectEmptyCollection()
  })

  it("drops the previous account's late responses", async () => {
    const auth = createMockAuth()
    // The demo account's first listing is still on its way…
    const held = holdCardRequests(() => true)
    worker.use(held.handler)
    await renderApp({ auth })
    await expect
      .element(page.getByRole('status').getByText(/Loading/))
      .toBeInTheDocument()

    // …when another account signs in, and its own listing is held too.
    auth.signIn('user_other')
    held.release()
    await expectEmptyCollection()
    await expect.element(cardTile(FIXTURE[0]!.question)).not.toBeInTheDocument()
  })

  it('sends only the signed-in account to the backend', async () => {
    const owners = new Set<string | undefined>()
    worker.use(
      http.all('/api/*', ({ request }) => {
        owners.add(mockOwnerOf(request))
      }),
    )
    const auth = createMockAuth('user_a')
    await renderApp({ auth })
    await expectEmptyCollection()
    expect([...owners]).toEqual(['user_a'])
  })
})

describe('Card limits', () => {
  it.for([
    ['question', 'Questions can be at most 2,000 characters.'],
    ['answer', 'Answers can be at most 10,000 characters.'],
    ['category', 'Category names can be at most 100 characters.'],
  ] as const)(
    'refuses a %s over its limit beside the field, sending nothing',
    async ([field, message]) => {
      let posts = 0
      worker.use(
        http.post('/api/cards', () => {
          posts++
        }),
      )
      await renderApp()
      await expectShowing(12, FIXTURE.length)

      // Surrounding whitespace doesn't count; one character too many does.
      await createCard({
        ...DNA,
        [field]: `  ${'😀'.repeat(MAX_LENGTHS[field] + 1)}  `,
      })
      await expect.element(createForm().getByText(message)).toBeVisible()
      await expect
        .element(fieldsIn(createForm())[field])
        .toHaveAttribute('aria-invalid', 'true')
      expect(posts).toBe(0)
    },
  )

  it('accepts text exactly at the limit, counting emoji as one character', async () => {
    await renderApp()
    await expectShowing(12, FIXTURE.length)
    await createCard({ ...DNA, category: '🧬'.repeat(MAX_LENGTHS.category) })
    await expect.element(toast('Card created successfully.')).toBeVisible()
  })

  it('explains when the Collection is full', async () => {
    mockStore.reset(
      Array.from({ length: CARD_QUOTA }, (_, i) => ({
        id: `card-${i}`,
        question: `Question ${i}?`,
        answer: 'Answer.',
        category: 'Bulk',
        progress: 0,
      })),
    )
    await renderApp()
    await expectShowing(12, CARD_QUOTA)

    await createCard(DNA)
    await expect
      .element(createForm().getByRole('alert'))
      .toHaveTextContent(
        'You have reached the limit of 1,000 cards. Delete a card to make room for a new one.',
      )
    await expect
      .element(fieldsIn(createForm()).question)
      .toHaveValue(DNA.question)
  })
})

describe('retrying a creation', () => {
  it('creates the Card once when the first response was lost', async () => {
    const keys: string[] = []
    let lost = false
    worker.use(
      http.post('/api/cards', async ({ request }) => {
        keys.push(request.headers.get(IDEMPOTENCY_KEY_HEADER) ?? '')
        if (lost) return
        lost = true
        // The backend saves the Card, but the response never arrives.
        const fields = (await request.json()) as CardText
        mockBackend
          .collectionOf(mockOwnerOf(request)!)
          .createCardOnce(fields, keys[0]!, creationFingerprint(fields))
        return serverError()
      }),
    )
    await renderApp()
    await expectShowing(12, FIXTURE.length)

    await createCard(DNA)
    await expect
      .element(createForm().getByRole('alert'))
      .toHaveTextContent('Your card could not be saved. Please try again.')

    await createButton().click()
    await expect.element(toast('Card created successfully.')).toBeVisible()
    await expectShowing(12, FIXTURE.length + 1)
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
    expect(mockStore.statistics([]).total).toBe(FIXTURE.length + 1)
  })

  it('uses a new key, and so a new Card, for the next creation of the same text', async () => {
    const keys: string[] = []
    worker.use(
      http.post('/api/cards', ({ request }) => {
        keys.push(request.headers.get(IDEMPOTENCY_KEY_HEADER) ?? '')
      }),
    )
    await renderApp()
    await expectShowing(12, FIXTURE.length)

    for (const total of [FIXTURE.length + 1, FIXTURE.length + 2]) {
      await createCard(DNA)
      await expectShowing(12, total)
    }
    expect(new Set(keys).size).toBe(2)
  })

  it('uses a new key once the text changes after a failure', async () => {
    const keys: string[] = []
    let failed = false
    worker.use(
      http.post('/api/cards', ({ request }) => {
        keys.push(request.headers.get(IDEMPOTENCY_KEY_HEADER) ?? '')
        if (failed) return
        failed = true
        return HttpResponse.json(
          { code: 'server_error', message: 'The server failed.' },
          { status: 500 },
        )
      }),
    )
    await renderApp()
    await expectShowing(12, FIXTURE.length)

    await createCard(DNA)
    await expect.element(createForm().getByRole('alert')).toBeVisible()
    await createCard({ ...DNA, answer: 'Deoxyribonucleic acid (DNA).' })
    await expect.element(toast('Card created successfully.')).toBeVisible()
    expect(keys).toHaveLength(2)
    expect(keys[1]).not.toBe(keys[0])
  })
})
