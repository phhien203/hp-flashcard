// Render with the app's real styles.
import '../styles.css'

import { afterEach, beforeAll, beforeEach } from 'vitest'

import { parkPointer } from '../../../../vitest.pointer.js'
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

  await parkPointer()
})

afterEach(() => {
  window.location.hash = ''
})
