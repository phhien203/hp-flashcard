import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'

// Font sizes are checked in px, at the browser's default 16px root size.
const presets = {
  'text-preset-2': { size: 24, lineHeight: 1.2, weight: '600', tracking: 0 },
  'text-preset-3': { size: 20, lineHeight: 1.2, weight: '600', tracking: 0 },
  'text-preset-4-semibold': {
    size: 16,
    lineHeight: 1.2,
    weight: '600',
    tracking: 0,
  },
  'text-preset-4-medium': {
    size: 16,
    lineHeight: 1.2,
    weight: '500',
    tracking: 0,
  },
  'text-preset-4-regular': {
    size: 16,
    lineHeight: 1.4,
    weight: '400',
    tracking: 0,
  },
  'text-preset-5-medium': {
    size: 14,
    lineHeight: 1.4,
    weight: '500',
    tracking: 0,
  },
  'text-preset-5-regular': {
    size: 14,
    lineHeight: 1.4,
    weight: '400',
    tracking: 0,
  },
  'text-preset-6': {
    size: 12,
    lineHeight: 1.3,
    weight: '500',
    tracking: -0.03,
  },
}

async function styleOf(className: string) {
  const screen = await render(<p className={className}>Sample</p>)
  return getComputedStyle(screen.getByText('Sample').element())
}

const px = (value: string) => Number.parseFloat(value)

// FontFace.weight may serialize 400 and 700 as keywords, depending on engine.
const numericWeight = (weight = '') =>
  ({ normal: '400', bold: '700' })[weight] ?? weight

describe('text presets', () => {
  afterEach(async () => {
    await page.viewport(414, 896)
  })

  it.each(Object.entries(presets))(
    '%s sets size, line height, weight and letter spacing',
    async (className, expected) => {
      const style = await styleOf(className)

      expect(px(style.fontSize)).toBe(expected.size)
      expect(px(style.lineHeight)).toBeCloseTo(
        expected.size * expected.lineHeight,
        1,
      )
      expect(style.fontWeight).toBe(expected.weight)
      expect(px(style.letterSpacing) || 0).toBeCloseTo(
        expected.size * expected.tracking,
        2,
      )
    },
  )

  it.each([
    [375, 24],
    [768, 32],
    [1024, 40],
  ])(
    'text-preset-1 is bold, 120%% line height and %ipx wide -> %ipx',
    async (width, size) => {
      await page.viewport(width, 800)
      const style = await styleOf('text-preset-1')

      expect(px(style.fontSize)).toBe(size)
      expect(px(style.lineHeight)).toBeCloseTo(size * 1.2, 1)
      expect(style.fontWeight).toBe('700')
      expect(px(style.letterSpacing) || 0).toBe(0)
    },
  )
})

describe('Poppins', () => {
  it('is the default font, with a system fallback', async () => {
    const screen = await render(<p>Sample</p>)
    const family = getComputedStyle(
      screen.getByText('Sample').element(),
    ).fontFamily

    expect(family).toMatch(/^"?Poppins"?,/)
    expect(family).toContain('sans-serif')
  })

  it.each(['400', '500', '600', '700'])(
    'loads weight %s from the stylesheet',
    async (weight) => {
      const [face] = await document.fonts.load(`${weight} 16px Poppins`, 'Aa')

      expect(face?.family.replaceAll('"', '')).toBe('Poppins')
      expect(numericWeight(face?.weight)).toBe(weight)
      expect(face?.status).toBe('loaded')
    },
  )
})
