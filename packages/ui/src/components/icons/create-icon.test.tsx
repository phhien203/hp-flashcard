import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'

import { createIcon } from './create-icon.js'

// A fixture, not a design-system icon: a filled square.
const SquareIcon = createIcon(
  'SquareIcon',
  '0 0 16 16',
  <path d="M0 0h16v16H0z" />,
)

describe('createIcon', () => {
  it('is hidden from assistive technology without a title', async () => {
    const screen = await render(<SquareIcon data-testid="icon" />)
    const icon = screen.getByTestId('icon')

    await expect.element(icon).toHaveAttribute('aria-hidden', 'true')
    await expect.element(icon).not.toHaveAttribute('role')
    expect(screen.getByRole('img').query()).toBeNull()
  })

  it('is an image named by its title', async () => {
    const screen = await render(<SquareIcon title="Shuffle cards" />)

    await expect
      .element(screen.getByRole('img', { name: 'Shuffle cards' }))
      .toBeVisible()
  })

  it('treats an empty title as decorative', async () => {
    const screen = await render(<SquareIcon title="" data-testid="icon" />)

    await expect
      .element(screen.getByTestId('icon'))
      .toHaveAttribute('aria-hidden', 'true')
  })

  it('fills with the current text color', async () => {
    const screen = await render(
      <span style={{ color: 'rgb(1, 2, 3)' }}>
        <SquareIcon data-testid="icon" />
      </span>,
    )
    const path = screen.getByTestId('icon').element().querySelector('path')!

    expect(getComputedStyle(path).fill).toBe('rgb(1, 2, 3)')
  })

  it('defaults to 16px and lets className resize it', async () => {
    const screen = await render(
      <>
        <SquareIcon data-testid="default" />
        <SquareIcon data-testid="large" className="size-300" />
      </>,
    )
    const box = (id: string) =>
      screen.getByTestId(id).element().getBoundingClientRect()

    expect(box('default').width).toBe(16)
    expect(box('default').height).toBe(16)
    expect(box('large').width).toBe(24)
  })

  it('sets its displayName', () => {
    expect(SquareIcon.displayName).toBe('SquareIcon')
  })
})
