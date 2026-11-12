import { describe, expect, it } from 'vitest'

import { cn } from '../index.js'
import theme from '../styles/theme.css?raw'

// Every token theme.css defines in a namespace, e.g. radius -> ['0', '4', …].
function themeTokens(namespace: string) {
  const pattern = new RegExp(String.raw`--${namespace}-([\w-]+):`, 'g')
  return [...theme.matchAll(pattern)].map(([, name]) => name)
}

describe('cn', () => {
  it('joins conditional class names', () => {
    const hidden: boolean = false
    expect(cn('flex', hidden && 'hidden', { 'gap-100': true })).toBe(
      'flex gap-100',
    )
  })

  it.each([
    [['p-100', 'p-200'], 'p-200'],
    [['h-400', 'h-full'], 'h-full'],
    [['rounded-10', 'rounded-8'], 'rounded-8'],
    [['rounded-4', 'rounded-full'], 'rounded-full'],
    [['max-w-page', 'max-w-dialog'], 'max-w-dialog'],
    [['w-dialog', 'w-full'], 'w-full'],
  ])('lets the later design-system token win: %j', (classes, expected) => {
    expect(cn(...classes)).toBe(expected)
  })

  // cn's config in utils.ts lists the radius and container names by hand.
  // A token added to theme.css but not there would not override its peers.
  it.each([
    ['radius', 'rounded'],
    ['container', 'max-w'],
  ])('knows every %s token in theme.css', (namespace, utility) => {
    const tokens = themeTokens(namespace)
    expect(tokens.length).toBeGreaterThan(1)
    for (const token of tokens) {
      const other = tokens.find((t) => t !== token)
      const earlier = `${utility}-${other}`
      const later = `${utility}-${token}`
      expect(cn(earlier, later)).toBe(later)
    }
  })
})
