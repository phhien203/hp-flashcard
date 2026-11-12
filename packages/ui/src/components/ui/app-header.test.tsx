import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

// Import from the public barrel so a missing export fails the test.
import { AppHeader, SegmentedNav, type AppHeaderProps } from '../../index.js'

const nav = (
  <SegmentedNav
    aria-label="Pages"
    items={[
      { label: 'Study Mode', href: '/study', current: true },
      { label: 'All Cards', href: '/cards' },
    ]}
  />
)

const renderHeader = (props: Partial<AppHeaderProps> = {}) =>
  render(<AppHeader nav={nav} logoHref="/" {...props} />)

/** The logo artworks AppHeader switches between. */
const artwork = (root: HTMLElement) => ({
  mark: root.querySelector(
    '[data-slot="app-header-logo"] > [data-slot="logo-mark"]',
  )!,
  full: root.querySelector(
    '[data-slot="app-header-logo"] > [data-slot="logo"]',
  )!,
})

const displayed = (element: Element) =>
  getComputedStyle(element).display !== 'none'

describe('AppHeader', () => {
  afterEach(async () => {
    await page.viewport(414, 896)
  })

  it('renders a banner landmark holding the nav slot', async () => {
    const screen = await renderHeader()

    const banner = screen.getByRole('banner')
    await expect.element(banner).toBeVisible()
    await expect
      .element(banner.getByRole('navigation', { name: 'Pages' }))
      .toBeVisible()
  })

  it('makes the logo a link named "Flashcard" when given logoHref', async () => {
    const screen = await renderHeader({ logoHref: '/home' })

    await expect
      .element(screen.getByRole('link', { name: 'Flashcard' }))
      .toHaveAttribute('href', '/home')
  })

  it('leaves the logo as plain text without logoHref', async () => {
    const screen = await renderHeader({ logoHref: undefined })

    expect(screen.getByRole('link', { name: 'Flashcard' }).query()).toBeNull()
    // Screen readers still read the app name, once.
    const readable = screen
      .getByText('Flashcard', { exact: true })
      .elements()
      .filter((element) => !element.closest('[aria-hidden="true"]'))
    expect(readable).toHaveLength(1)
  })

  it.each([
    [375, 'mark'],
    [767, 'mark'],
    [768, 'full'],
    [1280, 'full'],
  ] as const)('at %ipx wide shows the %s logo', async (width, expected) => {
    await page.viewport(width, 800)
    const screen = await renderHeader()

    const { mark, full } = artwork(screen.container)
    expect(displayed(mark)).toBe(expected === 'mark')
    expect(displayed(full)).toBe(expected === 'full')
    // The link keeps its name whichever artwork shows.
    await expect
      .element(screen.getByRole('link', { name: 'Flashcard' }))
      .toBeVisible()
  })

  it('puts the logo at the start and the nav at the end', async () => {
    await page.viewport(1024, 800)
    const screen = await renderHeader()

    const header = screen.getByRole('banner').element().getBoundingClientRect()
    const logo = screen
      .getByRole('link', { name: 'Flashcard' })
      .element()
      .getBoundingClientRect()
    const navBox = screen
      .getByRole('navigation')
      .element()
      .getBoundingClientRect()
    expect(Math.round(logo.left)).toBe(Math.round(header.left))
    expect(Math.round(navBox.right)).toBe(Math.round(header.right))
  })

  it('tabs to the logo link, with a ring, before the nav', async () => {
    const screen = await render(
      <>
        <button type="button">Before</button>
        <AppHeader nav={nav} logoHref="/" />
      </>,
    )
    screen.getByRole('button', { name: 'Before' }).element().focus()

    await userEvent.tab()
    const logo = screen.getByRole('link', { name: 'Flashcard' })
    await expect.element(logo).toHaveFocus()
    expect(getComputedStyle(logo.element()).boxShadow).toContain(
      'rgb(80, 114, 199)', // blue-600, the ring color
    )

    await userEvent.tab()
    await expect
      .element(screen.getByRole('link', { name: 'Study Mode' }))
      .toHaveFocus()
  })

  it('passes className and other props to the header', async () => {
    const screen = await renderHeader({ className: 'px-200', id: 'top' })

    const banner = screen.getByRole('banner').element()
    expect(banner.classList.contains('px-200')).toBe(true)
    expect(banner.id).toBe('top')
  })
})
