import { createIcon } from './create-icon.js'

/**
 * A cross, used by the Dialog and Toast close buttons.
 *
 * Drawn by hand on the 16px grid, not exported from Figma: the Figma file
 * was not reachable when it was added. Replace the path with the Figma
 * export once the icon set lands.
 */
export const IconClose = createIcon(
  'IconClose',
  '0 0 16 16',
  <path d="m4.1 3 3.9 3.9L11.9 3 13 4.1 9.1 8l3.9 3.9-1.1 1.1L8 9.1 4.1 13 3 11.9 6.9 8 3 4.1z" />,
)
