import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'

// Tailwind compiles this on import: the theme plus a few requested classes.
import probe from '../test/palette-probe.css?inline'
// Import from the public barrel so a missing export fails the test.
import { Button } from '../index.js'

/** Reads a style once the Button's transitions have settled. */
const settled = async (
  element: Element,
  property: 'borderTopColor' | 'backgroundColor',
) => {
  await Promise.all(element.getAnimations().map(({ finished }) => finished))
  return getComputedStyle(element)[property]
}

const background = (element: Element) =>
  getComputedStyle(element).backgroundColor

describe('theme tokens', () => {
  it('only offers Figma colors and shadows', () => {
    expect(probe).toContain('.bg-yellow-500')
    expect(probe).not.toContain('.bg-red-500')
    expect(probe).not.toContain('.text-slate-900')
    expect(probe).not.toContain('.shadow-lg')
  })

  it('maps the roles to Figma colors in light', async () => {
    const screen = await render(<Button>Save</Button>)
    const button = screen.getByRole('button')
    // An earlier test file may have left the pointer where the button renders.
    await userEvent.unhover(button)

    expect(background(document.body)).toBe('rgb(247, 243, 240)') // neutral-100
    expect(await settled(button.element(), 'backgroundColor')).toBe(
      'rgb(248, 203, 70)', // yellow-500
    )
  })

  it('switches the roles under a nested .dark', async () => {
    const screen = await render(
      <div className="dark">
        <div className="bg-card text-foreground" data-testid="card">
          <Button variant="outline">Save</Button>
        </div>
      </div>,
    )

    const card = screen.getByTestId('card').element()
    expect(background(card)).toBe('rgb(46, 20, 1)') // neutral-900
    expect(getComputedStyle(card).color).toBe('rgb(247, 243, 240)') // neutral-100
    expect(
      getComputedStyle(screen.getByRole('button').element()).borderTopColor,
    ).toBe('rgb(247, 243, 240)') // border: neutral-100
  })

  it('shows the ring color on keyboard focus only', async () => {
    const screen = await render(<Button>Save</Button>)
    const button = screen.getByRole('button').element()
    const ring = 'rgb(80, 114, 199)' // blue-600

    await userEvent.click(button)
    expect(await settled(button, 'borderTopColor')).not.toBe(ring)

    await userEvent.click(document.body)
    await userEvent.tab()
    expect(button).toBe(document.activeElement)
    expect(await settled(button, 'borderTopColor')).toBe(ring)
  })
})
