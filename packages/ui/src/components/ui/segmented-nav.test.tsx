import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'

// Import from the public barrel so a missing export fails the test.
import {
  SegmentedNav,
  type SegmentedNavItem,
  type SegmentedNavProps,
} from '../../index.js'
import { settle } from '../../test/settle.js'

const items: SegmentedNavItem[] = [
  { label: 'Study Mode', href: '/study', current: true },
  { label: 'All Cards', href: '/cards' },
]

const renderNav = (props: Partial<SegmentedNavProps> = {}) =>
  render(<SegmentedNav aria-label="Pages" items={items} {...props} />)

/**
 * Renders the nav after a focusable element and focuses that element, so Tab
 * starts from a known point. After an earlier test, Firefox sends the first
 * Tab from <body> out of the page instead of to its first link.
 */
const renderForKeyboard = async () => {
  const screen = await render(
    <>
      <button type="button">Before</button>
      <SegmentedNav aria-label="Pages" items={items} />
    </>,
  )
  screen.getByRole('button', { name: 'Before' }).element().focus()
  return screen
}

describe('SegmentedNav', () => {
  it('renders a named navigation landmark of links from the items', async () => {
    const screen = await renderNav()

    const nav = screen.getByRole('navigation', { name: 'Pages' })
    await expect.element(nav).toBeVisible()
    const links = nav.getByRole('link').elements()
    expect(links.map((link) => link.textContent)).toEqual([
      'Study Mode',
      'All Cards',
    ])
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/study',
      '/cards',
    ])
  })

  it('marks only the current item with aria-current="page"', async () => {
    const screen = await renderNav()

    await expect
      .element(screen.getByRole('link', { name: 'Study Mode' }))
      .toHaveAttribute('aria-current', 'page')
    await expect
      .element(screen.getByRole('link', { name: 'All Cards' }))
      .not.toHaveAttribute('aria-current')
  })

  it('fills the current item with the yellow primary color', async () => {
    const screen = await renderNav()

    const style = (name: string) =>
      getComputedStyle(screen.getByRole('link', { name }).element())
    expect(style('Study Mode').backgroundColor).toBe('rgb(248, 203, 70)') // yellow-500
    expect(style('All Cards').backgroundColor).toBe('rgba(0, 0, 0, 0)')
  })

  it('shows a border on hover over a link that is not current', async () => {
    const screen = await renderNav()
    const link = screen.getByRole('link', { name: 'All Cards' }).element()

    await settle(link)
    expect(getComputedStyle(link).borderTopColor).toBe('rgba(0, 0, 0, 0)')

    await userEvent.hover(link)
    await settle(link)
    expect(getComputedStyle(link).borderTopColor).toBe('rgb(46, 20, 1)') // neutral-900
    await userEvent.unhover(link)
  })

  it('moves keyboard focus through the links in order, with a ring', async () => {
    const screen = await renderForKeyboard()

    await userEvent.tab()
    await expect
      .element(screen.getByRole('link', { name: 'Study Mode' }))
      .toHaveFocus()
    await userEvent.tab()
    const cards = screen.getByRole('link', { name: 'All Cards' })
    await expect.element(cards).toHaveFocus()

    await settle(cards.element())
    expect(getComputedStyle(cards.element()).borderTopColor).toBe(
      'rgb(80, 114, 199)', // blue-600, the ring color
    )
  })

  it('follows a link with Enter', async () => {
    const onClick = vi.fn((event: MouseEvent) => event.preventDefault())
    const screen = await renderForKeyboard()
    screen.container.addEventListener('click', onClick)

    await userEvent.tab()
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')

    expect(onClick).toHaveBeenCalledOnce()
    expect((onClick.mock.calls[0]![0].target as Element).textContent).toBe(
      'All Cards',
    )
  })

  it('renders each link through the render hook, such as a router link', async () => {
    const navigate = vi.fn()
    function RouterLink({
      to,
      ...props
    }: ComponentProps<'a'> & { to: string }) {
      return (
        <a
          {...props}
          href={to}
          data-router=""
          onClick={(event) => {
            event.preventDefault()
            navigate(to)
          }}
        />
      )
    }

    const screen = await renderNav({
      render: (props) => <RouterLink {...props} to={props.href ?? ''} />,
    })

    const cards = screen.getByRole('link', { name: 'All Cards' })
    await expect.element(cards).toHaveAttribute('data-router')
    await expect
      .element(screen.getByRole('link', { name: 'Study Mode' }))
      .toHaveAttribute('aria-current', 'page')

    await cards.click()

    expect(navigate).toHaveBeenCalledWith('/cards')
  })

  it('accepts an element as the render hook', async () => {
    const screen = await renderNav({ render: <a data-custom="" /> })

    await expect
      .element(screen.getByRole('link', { name: 'All Cards' }))
      .toHaveAttribute('data-custom')
    await expect
      .element(screen.getByRole('link', { name: 'All Cards' }))
      .toHaveAttribute('href', '/cards')
  })

  it('merges a consumer className onto the landmark', async () => {
    const screen = await renderNav({ className: 'mt-200' })

    expect(
      screen.getByRole('navigation').element().classList.contains('mt-200'),
    ).toBe(true)
  })

  it('requires a name for the landmark', () => {
    // @ts-expect-error: aria-label is required.
    const unnamed: SegmentedNavProps = { items }

    expect(unnamed.items).toHaveLength(2)
  })
})
