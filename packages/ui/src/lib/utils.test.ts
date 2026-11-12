import { describe, expect, it } from 'vitest'

import { cn } from '../index.js'

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
})
