import { createCn } from 'cn/config'

/**
 * Joins class names and resolves Tailwind conflicts (clsx + tailwind-merge).
 *
 * The merger is told about the design system's named scales from theme.css:
 * by default it recognises spacing numbers (`p-100`) but not `rounded-8` or
 * `max-w-dialog`, so `cn('rounded-10', 'rounded-8')` would keep both.
 */
export const cn = createCn({
  extend: {
    theme: {
      radius: ['0', '4', '6', '8', '10', '12', '16', '20', '24', 'full'],
      container: ['dialog', 'page'],
    },
  },
})
