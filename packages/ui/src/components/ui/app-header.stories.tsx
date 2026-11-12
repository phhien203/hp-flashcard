import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { AppHeader } from './app-header.js'
import { SegmentedNav } from './segmented-nav.js'

const nav = (
  <SegmentedNav
    aria-label="Pages"
    items={[
      { label: 'Study Mode', href: '/study', current: true },
      { label: 'All Cards', href: '/cards' },
    ]}
  />
)

/** Which logo artwork is displayed: the 40×40 mark or the full logo. */
const shownLogo = (root: HTMLElement) => {
  const mark = root.querySelector(
    '[data-slot="app-header-logo"] > [data-slot="logo-mark"]',
  )!
  const full = root.querySelector(
    '[data-slot="app-header-logo"] > [data-slot="logo"]',
  )!
  const shown = (el: Element) => getComputedStyle(el).display !== 'none'
  return shown(mark) && !shown(full)
    ? 'mark'
    : shown(full) && !shown(mark)
      ? 'full'
      : 'both or neither'
}

const meta = {
  title: 'Components/AppHeader',
  component: AppHeader,
  tags: ['autodocs'],
  args: { nav, logoHref: '/' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AppHeader>

export default meta
type Story = StoryObj<typeof meta>

/** Below `md` (414px wide): the 40×40 mark beside the nav. */
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile2' } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('banner')).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Flashcard' })).toBeVisible()
    await expect(
      canvas.getByRole('navigation', { name: 'Pages' }),
    ).toBeVisible()
    await expect(shownLogo(canvasElement)).toBe('mark')
  },
}

/** From `md` up (834px wide): the full logo. */
export const Tablet: Story = {
  globals: { viewport: { value: 'tablet' } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('link', { name: 'Flashcard' })).toBeVisible()
    await expect(shownLogo(canvasElement)).toBe('full')
  },
}

/** Desktop (1280px wide): the full logo, the nav at the far end. */
export const Desktop: Story = {
  globals: { viewport: { value: 'desktop' } },
  play: async ({ canvas, canvasElement }) => {
    await expect(shownLogo(canvasElement)).toBe('full')
    const header = canvas.getByRole('banner').getBoundingClientRect()
    const navBox = canvas
      .getByRole('navigation', { name: 'Pages' })
      .getBoundingClientRect()
    await expect(Math.round(navBox.right)).toBe(Math.round(header.right))
  },
}

/** Tabbing reaches the logo link first, with a ring, then the nav. */
export const KeyboardFocus: Story = {
  play: async ({ canvas, userEvent }) => {
    const logo = canvas.getByRole('link', { name: 'Flashcard' })

    await userEvent.tab()
    await expect(logo).toHaveFocus()
    await expect(getComputedStyle(logo).boxShadow).not.toBe('none')

    await userEvent.tab()
    await expect(canvas.getByRole('link', { name: 'Study Mode' })).toHaveFocus()
  },
}

/** Without `logoHref` the logo is not a link, but still reads "Flashcard". */
export const WithoutLogoLink: Story = {
  args: { logoHref: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('link', { name: 'Flashcard' })).toBeNull()
    await expect(canvas.getByRole('banner')).toHaveTextContent('Flashcard')
  },
}
