// Render unit tests with the real design-system styles.
import './setup.css'

import { beforeEach } from 'vitest'
import { userEvent } from 'vitest/browser'

// The real pointer stays wherever the last test left it, and every test
// renders in the same spot, so a new component can start under it with :hover
// applied. Park the pointer in the bottom-right corner before each test, away
// from where components render.
beforeEach(async () => {
  const park = document.createElement('div')
  Object.assign(park.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '1px',
    height: '1px',
    zIndex: '2147483647',
  })
  document.body.append(park)
  try {
    await userEvent.hover(park)
  } finally {
    park.remove()
  }
})
