import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'

// Import from the public barrel so a missing export fails the test.
import { Progress } from '../../index.js'

describe('Progress', () => {
  it('is a progress bar named by aria-label, from 0 to 5 by default', async () => {
    const screen = await render(<Progress aria-label="Mastery" value={3} />)

    const bar = screen.getByRole('progressbar', { name: 'Mastery' })
    await expect.element(bar).toHaveAttribute('aria-valuenow', '3')
    await expect.element(bar).toHaveAttribute('aria-valuemin', '0')
    await expect.element(bar).toHaveAttribute('aria-valuemax', '5')
    await expect.element(bar).toHaveAttribute('aria-valuetext', '3 of 5')
  })

  it('hides the count unless showCount is set', async () => {
    const screen = await render(<Progress aria-label="Mastery" value={3} />)
    await expect.element(screen.getByText('3/5')).not.toBeInTheDocument()

    await screen.rerender(<Progress aria-label="Mastery" value={3} showCount />)
    await expect.element(screen.getByText('3/5')).toBeVisible()
  })

  it('takes a custom max', async () => {
    const screen = await render(
      <Progress aria-label="Mastery" value={4} max={10} showCount />,
    )

    const bar = screen.getByRole('progressbar')
    await expect.element(bar).toHaveAttribute('aria-valuemax', '10')
    await expect.element(bar).toHaveAttribute('aria-valuetext', '4 of 10')
    await expect.element(screen.getByText('4/10')).toBeVisible()
  })

  it('clamps values outside 0 to max', async () => {
    const screen = await render(
      <>
        <Progress aria-label="Under" value={-2} showCount />
        <Progress aria-label="Over" value={9} showCount />
      </>,
    )

    await expect
      .element(screen.getByRole('progressbar', { name: 'Under' }))
      .toHaveAttribute('aria-valuenow', '0')
    await expect
      .element(screen.getByRole('progressbar', { name: 'Over' }))
      .toHaveAttribute('aria-valuenow', '5')
    await expect.element(screen.getByText('0/5')).toBeVisible()
    await expect.element(screen.getByText('5/5')).toBeVisible()
  })

  it('treats a non-finite value as 0', async () => {
    const screen = await render(
      <Progress aria-label="Mastery" value={Number.NaN} showCount />,
    )

    const bar = screen.getByRole('progressbar')
    await expect.element(bar).toHaveAttribute('aria-valuenow', '0')
    await expect.element(bar).toHaveAttribute('aria-valuetext', '0 of 5')
    await expect.element(screen.getByText('0/5')).toBeVisible()
  })

  it('can be named by a visible label', async () => {
    const screen = await render(
      <>
        <span id="mastery">Card mastery</span>
        <Progress aria-labelledby="mastery" value={1} />
      </>,
    )

    await expect
      .element(screen.getByRole('progressbar', { name: 'Card mastery' }))
      .toBeVisible()
  })

  it('fills the bar in proportion to the value', async () => {
    const screen = await render(
      <>
        <Progress aria-label="Empty" value={0} />
        <Progress aria-label="Two" value={2} />
        <Progress aria-label="Full" value={5} />
      </>,
    )
    const fill = (name: string) => {
      const bar = screen.getByRole('progressbar', { name }).element()
      const track = bar.querySelector('[data-slot="progress-track"]')
      const indicator = bar.querySelector('[data-slot="progress-indicator"]')
      if (!track || !indicator) throw new Error('missing track or indicator')
      return (
        indicator.getBoundingClientRect().width / track.clientWidth
      ).toFixed(2)
    }

    expect(fill('Empty')).toBe('0.00')
    expect(fill('Two')).toBe('0.40')
    expect(fill('Full')).toBe('1.00')
  })
})
