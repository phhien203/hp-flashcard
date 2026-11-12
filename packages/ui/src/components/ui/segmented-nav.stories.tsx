import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import { expect, fn } from 'storybook/test'

import { cn } from '../../lib/utils.js'
import { settle } from '../../test/settle.js'
import { SegmentedNav, type SegmentedNavItem } from './segmented-nav.js'

const pages = [
  { label: 'Study Mode', href: '/study' },
  { label: 'All Cards', href: '/cards' },
] as const

const itemsAt = (href: string): SegmentedNavItem[] =>
  pages.map((page) => ({ ...page, current: page.href === href }))

/** A CSS color as the browser resolves it, for comparing with styles. */
const resolved = (css: string) => {
  const probe = document.createElement('div')
  probe.style.color = css
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

const meta = {
  title: 'Components/SegmentedNav',
  component: SegmentedNav,
  tags: ['autodocs'],
  args: {
    'aria-label': 'Pages',
    items: itemsAt('/study'),
  },
} satisfies Meta<typeof SegmentedNav>

export default meta
type Story = StoryObj<typeof meta>

export const StudyModeCurrent: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('navigation', { name: 'Pages' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('link', { name: 'Study Mode' }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(
      canvas.getByRole('link', { name: 'All Cards' }),
    ).not.toHaveAttribute('aria-current')
  },
}

export const AllCardsCurrent: Story = {
  args: { items: itemsAt('/cards') },
  play: async ({ canvas }) => {
    const current = canvas.getByRole('link', { name: 'All Cards' })
    await expect(current).toHaveAttribute('aria-current', 'page')
    await expect(getComputedStyle(current).backgroundColor).toBe(
      resolved('var(--primary)'),
    )
  },
}

// No Hover story: Storybook's userEvent fires synthetic events, which never
// apply CSS :hover. The "shows a border on hover" test in
// segmented-nav.test.tsx checks it, and the States story shows it.

export const KeyboardFocus: Story = {
  play: async ({ canvas, userEvent }) => {
    const study = canvas.getByRole('link', { name: 'Study Mode' })
    const cards = canvas.getByRole('link', { name: 'All Cards' })

    await userEvent.tab()
    await expect(study).toHaveFocus()
    await userEvent.tab()
    await expect(cards).toHaveFocus()

    await settle(cards)
    await expect(getComputedStyle(cards).borderTopColor).toBe(
      resolved('var(--ring)'),
    )
  },
}

/**
 * A fake router: its `Link` takes `to` instead of `href` and navigates
 * without loading a page, the way client-side routers do.
 */
const navigate = fn()

function FakeRouterLink({
  to,
  onNavigate,
  ...props
}: ComponentProps<'a'> & { to: string; onNavigate: (to: string) => void }) {
  return (
    <a
      {...props}
      href={to}
      data-router-link=""
      onClick={(event) => {
        event.preventDefault()
        onNavigate(to)
      }}
    />
  )
}

function RouterDemo() {
  const [path, setPath] = useState('/study')
  const go = (to: string) => {
    navigate(to)
    setPath(to)
  }
  return (
    <SegmentedNav
      aria-label="Pages"
      items={itemsAt(path)}
      render={(props) => (
        <FakeRouterLink {...props} to={props.href ?? ''} onNavigate={go} />
      )}
    />
  )
}

/** The app passes its router link through `render`. */
export const WithRouterLink: Story = {
  render: () => <RouterDemo />,
  play: async ({ canvas, userEvent }) => {
    navigate.mockClear()
    const cards = canvas.getByRole('link', { name: 'All Cards' })
    await expect(cards).toHaveAttribute('data-router-link')

    await userEvent.click(cards)

    await expect(navigate).toHaveBeenCalledWith('/cards')
    await expect(cards).toHaveAttribute('aria-current', 'page')
  },
}

/**
 * Rest, hover and keyboard focus on the link that isn't current. Real
 * pseudo-states can't be pinned in a static story, so these copy the classes
 * `segmented-nav.tsx` applies on `hover:` and `focus-visible:`; keep them in
 * sync. The tests check the real hover and focus styles.
 */
export const States: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-200">
      {(['Rest', 'Hover', 'Focus'] as const).map((state) => (
        <SegmentedNav
          key={state}
          aria-label={`Pages (${state.toLowerCase()})`}
          items={itemsAt('/study')}
          render={(props) => (
            <a
              {...props}
              className={cn(
                props.className,
                !props['aria-current'] &&
                  {
                    Rest: undefined,
                    Hover: 'border-border',
                    Focus: 'border-ring ring-2 ring-ring',
                  }[state],
              )}
            />
          )}
        />
      ))}
    </div>
  ),
}
