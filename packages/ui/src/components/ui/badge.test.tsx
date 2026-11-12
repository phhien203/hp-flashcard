import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'

// Import from the public barrel so a missing export fails the test.
import { Badge } from '../../index.js'

const color = (element: Element) => getComputedStyle(element).backgroundColor

describe('Badge', () => {
  it('shows its text', async () => {
    const screen = await render(<Badge>Geography</Badge>)

    await expect.element(screen.getByText('Geography')).toBeVisible()
  })

  it('is the outline category tag by default', async () => {
    const screen = await render(
      <>
        <Badge>Default</Badge>
        <Badge variant="outline">Outline</Badge>
      </>,
    )

    expect(color(screen.getByText('Default').element())).toBe(
      color(screen.getByText('Outline').element()),
    )
  })

  it('renders the mastered pill teal with dark text and a decorative icon', async () => {
    const screen = await render(
      <Badge variant="mastered" icon={<svg data-testid="icon" />}>
        Mastered
      </Badge>,
    )
    const pill = screen.getByText('Mastered').element()

    expect(color(pill)).toBe('rgb(71, 217, 201)') // teal-400
    expect(getComputedStyle(pill).color).toBe('rgb(46, 20, 1)') // neutral-900
    // The icon comes before the text.
    expect(pill.firstElementChild).toBe(screen.getByTestId('icon').element())
  })

  it('keeps the mastered pill the same in the dark theme', async () => {
    const screen = await render(
      <div className="dark">
        <Badge variant="mastered">Mastered</Badge>
        <Badge>Tag</Badge>
      </div>,
    )
    const pill = screen.getByText('Mastered').element()

    expect(color(pill)).toBe('rgb(71, 217, 201)')
    expect(getComputedStyle(pill).color).toBe('rgb(46, 20, 1)')
    // The category tag follows the theme: neutral-900 card in dark.
    expect(color(screen.getByText('Tag').element())).toBe('rgb(46, 20, 1)')
  })

  it('passes through span props', async () => {
    const screen = await render(
      <Badge title="Category" data-testid="badge">
        Geography
      </Badge>,
    )

    await expect
      .element(screen.getByTestId('badge'))
      .toHaveAttribute('title', 'Category')
  })
})
