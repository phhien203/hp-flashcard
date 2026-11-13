import { userEvent } from 'vitest/browser'

/**
 * Parks the real pointer in the bottom-right corner, away from where tests
 * render. The pointer stays wherever the last test left it, so without this a
 * new component can start under it with :hover applied. Call it from a
 * browser-mode setup file's `beforeEach`. The target is 16px because Chromium
 * misses a 1px one on the edge of the scaled test iframe, and the hover never
 * lands.
 */
export async function parkPointer() {
  const park = document.createElement('div')
  // A unique id gives the hover a selector that matches only this element,
  // whatever else (portals, say) sits in <body>.
  park.id = 'vitest-pointer-park'
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
}
