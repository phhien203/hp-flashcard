import { describe, expect, it } from 'vitest'

import {
  checkBuiltCss,
  FONT_WEIGHTS,
  fontFaceUrls,
  REQUIRED_SELECTORS,
  resolvePackagePath,
} from './built-css.ts'

const fontFace = (weight: string, url: string) =>
  `@font-face{font-family:Poppins;font-weight:${weight};src:url(${url}) format("woff2")}`

const fontFile = (weight: string) => `./files/poppins-latin-${weight}.woff2`

const goodCss = [
  ':root{--font-sans:"Poppins", ui-sans-serif, system-ui, sans-serif}',
  ...REQUIRED_SELECTORS.map((selector) => `${selector}{font-size:1rem}`),
  ...FONT_WEIGHTS.map((weight) => fontFace(weight, fontFile(weight))),
].join('')

const goodFiles = FONT_WEIGHTS.map(
  (weight) => `dist/files/poppins-latin-${weight}.woff2`,
)

const check = (css: string, packedFiles = goodFiles) =>
  checkBuiltCss({ css, cssPath: 'dist/styles.css', packedFiles })

describe('checkBuiltCss', () => {
  it('passes CSS with every token utility and packed font files', () => {
    expect(check(goodCss)).toEqual([])
  })

  it('reports a missing text preset', () => {
    const css = goodCss.replace('.text-preset-6{', '.text-preset-7{')

    expect(check(css)).toEqual(['missing .text-preset-6'])
  })

  it('does not take a longer utility name for a required one', () => {
    const css = goodCss.replace('.text-preset-1{', '.text-preset-10{')

    expect(check(css)).toEqual(['missing .text-preset-1'])
  })

  it("reports Tailwind's default font stack", () => {
    const css = `${goodCss}:root{--font-sans:ui-sans-serif, system-ui}`

    expect(check(css)).toEqual([
      "contains Tailwind's default --font-sans (it should be Poppins)",
    ])
  })

  it('reports a missing Poppins weight', () => {
    const css = goodCss.replace(fontFace('600', fontFile('600')), '')

    expect(check(css)).toEqual(['missing Poppins 600 @font-face'])
  })

  it('reports a font URL whose file is not packed', () => {
    expect(check(goodCss, goodFiles.slice(1))).toEqual([
      'font URL ./files/poppins-latin-400.woff2 -> dist/files/poppins-latin-400.woff2 is not in the packed output',
    ])
  })

  it('reports a font URL that leaves the package', () => {
    const url = '../../node_modules/@fontsource/poppins/files/x.woff2'
    const css = `${goodCss}${fontFace('400', url)}`

    expect(check(css)).toEqual([`font URL ${url} points outside the package`])
  })
})

describe('fontFaceUrls', () => {
  it('collects quoted and unquoted URLs from @font-face rules only', () => {
    const css = [
      `@font-face{src:url("./a.woff2") format("woff2"),url(./a.woff) format("woff")}`,
      `.bg{background:url(./not-a-font.png)}`,
      `@font-face{src:url('./b.woff2')}`,
    ].join('')

    expect(fontFaceUrls(css)).toEqual(['./a.woff2', './a.woff', './b.woff2'])
  })
})

describe('resolvePackagePath', () => {
  it('resolves relative to the CSS file', () => {
    expect(resolvePackagePath('dist/styles.css', './files/a.woff2')).toBe(
      'dist/files/a.woff2',
    )
    expect(
      resolvePackagePath('dist/styles/theme.css', '../files/a.woff2'),
    ).toBe('dist/files/a.woff2')
  })

  it('rejects absolute, remote and out-of-package URLs', () => {
    expect(resolvePackagePath('dist/styles.css', '/a.woff2')).toBeUndefined()
    expect(
      resolvePackagePath('dist/styles.css', 'https://cdn.test/a.woff2'),
    ).toBeUndefined()
    expect(
      resolvePackagePath('dist/styles.css', '../../a.woff2'),
    ).toBeUndefined()
  })
})
