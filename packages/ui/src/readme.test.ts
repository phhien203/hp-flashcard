import { describe, expect, it } from 'vitest'

import eslintConfig from '../../../eslint.config.js?raw'
import pkg from '../package.json'
import readme from '../README.md?raw'

// The README is the consumer setup guide: keep what it tells people to
// import and copy in step with the package and the repo's own lint rule.

const LINT_PATTERN = /pattern: String\.raw`([^`]+)`/

describe('README', () => {
  it('only names subpaths the package exports', () => {
    const named = new Set(
      [...readme.matchAll(/@hp-flashcard\/ui\/([\w-]+(?:\.[\w-]+)*)/g)].map(
        ([, subpath]) => `./${subpath}`,
      ),
    )
    expect([...named]).toEqual(
      expect.arrayContaining(['./styles.css', './theme.css', './fonts.css']),
    )
    for (const subpath of named) {
      expect(Object.keys(pkg.exports)).toContain(subpath)
    }
  })

  it("copies the repo's arbitrary-value lint pattern", () => {
    const fromReadme = readme.match(LINT_PATTERN)?.[1]
    expect(fromReadme).toBeDefined()
    expect(fromReadme).toBe(eslintConfig.match(LINT_PATTERN)?.[1])
  })

  it('bans arbitrary values but not tokens or arbitrary variants', () => {
    const pattern = new RegExp(readme.match(LINT_PATTERN)?.[1] ?? '$^')
    for (const banned of [
      'p-[13px]',
      'bg-(--x)',
      '[mask-type:alpha]',
      'bg-red/[0.5]',
      'md:hover:w-[3px]!',
    ]) {
      expect(banned).toMatch(pattern)
    }
    for (const allowed of [
      'p-100',
      'rounded-8',
      'bg-primary/50',
      '[&_svg]:size-200',
      'has-data-[icon=x]:pl-150',
    ]) {
      expect(allowed).not.toMatch(pattern)
    }
  })
})
