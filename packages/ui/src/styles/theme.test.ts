import { compile } from 'tailwindcss'
import tailwindIndex from 'tailwindcss/index.css?raw'
import tailwindPreflight from 'tailwindcss/preflight.css?raw'
import tailwindTheme from 'tailwindcss/theme.css?raw'
import tailwindUtilities from 'tailwindcss/utilities.css?raw'
import { describe, expect, it } from 'vitest'

import theme from './theme.css?raw'

const tailwindFiles: Record<string, string> = {
  tailwindcss: tailwindIndex,
  './theme.css': tailwindTheme,
  './preflight.css': tailwindPreflight,
  './utilities.css': tailwindUtilities,
  // theme.css imports the Poppins @font-face rules. They don't affect the
  // tokens under test, so stub them rather than resolve @fontsource here.
  './fonts.css': '',
}

// Compile theme.css the way a consumer's Tailwind v4 build does, and return
// the CSS generated for the given class names.
async function build(classNames: string[]) {
  const compiler = await compile(`@import 'tailwindcss';\n${theme}`, {
    loadStylesheet: async (id, base) => {
      const content = tailwindFiles[id]
      if (content === undefined) throw new Error(`Unexpected import: ${id}`)
      return { path: id, base, content }
    },
  })
  return compiler.build(classNames)
}

async function generates(className: string) {
  const css = await build([className])
  return css.includes(`.${CSS.escape(className)} {`)
}

const SPACING = {
  0: '0px',
  25: '2px',
  50: '4px',
  75: '6px',
  100: '8px',
  125: '10px',
  150: '12px',
  200: '16px',
  250: '20px',
  300: '24px',
  400: '32px',
  500: '40px',
  600: '48px',
  800: '64px',
  1000: '80px',
  1200: '96px',
  1400: '112px',
  1600: '128px',
  1800: '140px',
}

const RADIUS = {
  0: '0px',
  4: '4px',
  6: '6px',
  8: '8px',
  10: '10px',
  12: '12px',
  16: '16px',
  20: '20px',
  24: '24px',
  full: '999px',
}

describe('spacing tokens', () => {
  it.each(Object.entries(SPACING))('spacing-%s is %s', async (name, value) => {
    const css = await build([`p-${name}`])
    expect(css).toContain(`.p-${name} {`)
    expect(css).toContain(`--spacing-${name}: ${value};`)
  })

  it.each(['p-7', 'p-2.5', 'gap-4', 'h-8', 'size-px-2'])(
    'clears the Tailwind spacing multiplier: %s generates nothing',
    async (className) => {
      expect(await generates(className)).toBe(false)
    },
  )

  it.each(['w-full', 'w-1/2', 'h-px', 'p-px', 'translate-y-px'])(
    'keeps static and fractional sizes: %s',
    async (className) => {
      expect(await generates(className)).toBe(true)
    },
  )
})

describe('radius tokens', () => {
  it.each(Object.entries(RADIUS))('radius-%s is %s', async (name, value) => {
    const css = await build([`rounded-${name}`])
    expect(css).toContain(`.rounded-${name} {`)
    expect(css).toContain(`--radius-${name}: ${value};`)
  })

  it.each(['rounded', 'rounded-xs', 'rounded-sm', 'rounded-lg', 'rounded-4xl'])(
    'removes the Tailwind and shadcn radius scales: %s generates nothing',
    async (className) => {
      expect(await generates(className)).toBe(false)
    },
  )
})

describe('named size tokens', () => {
  it.each([
    ['dialog', '600px'],
    ['page', '1240px'],
  ])('container-%s is %s', async (name, value) => {
    const css = await build([`max-w-${name}`, `w-${name}`])
    expect(css).toContain(`.max-w-${name} {`)
    expect(css).toContain(`.w-${name} {`)
    expect(css).toContain(`--container-${name}: ${value};`)
  })

  it.each(['max-w-md', 'max-w-7xl', 'w-sm'])(
    'removes the Tailwind container scale: %s generates nothing',
    async (className) => {
      expect(await generates(className)).toBe(false)
    },
  )
})
