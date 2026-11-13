// Render with the app's real styles.
import '../styles.css'

import { afterEach, beforeAll, beforeEach } from 'vitest'
import { userEvent } from 'vitest/browser'

import { startMockBackend, worker } from '../mocks/browser.js'
import { mockStore } from '../mocks/store.js'

// The real service worker serves the mock backend, as in the app.
beforeAll(async () => {
  await startMockBackend({ quiet: true })
})

// Every test starts from the fixture, with no handler overrides, on the
// default page. (Each test renders with a fresh QueryClient.)
beforeEach(async () => {
  mockStore.reset()
  worker.resetHandlers()
  window.location.hash = ''

  // The real pointer stays wherever the last test left it. Park it in the
  // bottom-right corner, away from where the app renders, as packages/ui does.
  const park = document.createElement('div')
  Object.assign(park.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '16px',
    height: '16px',
    zIndex: '2147483647',
  })
  document.body.append(park)
  try {
    await userEvent.hover(park)
  } finally {
    park.remove()
  }
})

afterEach(() => {
  window.location.hash = ''
})
