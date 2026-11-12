import { createIcon } from './create-icon.js'

/**
 * Error indicator: an exclamation mark in a filled circle.
 *
 * Drawn by hand on the 16px grid, not exported from Figma: the Figma file
 * was not reachable when it was added. Replace the path with the Figma
 * export once the icon set lands.
 */
export const IconError = createIcon(
  'IconError',
  '0 0 16 16',
  <path
    fillRule="evenodd"
    d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-.75 3.5h1.5v5h-1.5v-5Zm0 6h1.5V12h-1.5v-1.5Z"
  />,
)
