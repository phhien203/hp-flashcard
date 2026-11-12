import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'

// Import from the public barrel so a missing export fails the test.
import { Button, type ButtonProps } from '../../index.js'
import { settle } from '../../test/settle.js'

/** The last box-shadow layer (the token one), without its color. */
const shadowOffsets = async (element: Element) => {
  await settle(element)
  return getComputedStyle(element)
    .boxShadow.replace(/[a-z]+\([^)]*\)/g, '')
    .split(',')
    .at(-1)!
    .trim()
}

const Icon = () => <svg aria-hidden="true" data-testid="icon" />

describe('Button', () => {
  it('renders an accessible button with its label', async () => {
    const screen = await render(<Button>Save</Button>)

    await expect
      .element(screen.getByRole('button', { name: 'Save' }))
      .toBeVisible()
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    const screen = await render(<Button onClick={onClick}>Save</Button>)

    await screen.getByRole('button').click()

    expect(onClick).toHaveBeenCalledOnce()
  })

  it.each(['{Enter}', ' '])(
    'activates with %s from the keyboard',
    async (key) => {
      const onClick = vi.fn()
      await render(<Button onClick={onClick}>Save</Button>)

      await userEvent.tab()
      await userEvent.keyboard(key)

      expect(onClick).toHaveBeenCalledOnce()
    },
  )

  // This is the hover check: Storybook's userEvent fires synthetic events,
  // which never apply CSS :hover, so there is no Hover story (decided in
  // PR #29 rather than adding storybook-addon-pseudo-states).
  it('lifts its shadow from shadow-rest to shadow-hover on hover', async () => {
    const screen = await render(<Button>Save</Button>)
    const button = screen.getByRole('button').element()

    expect(await shadowOffsets(button)).toBe('2px 2px 0px 0px')

    await userEvent.hover(button)
    expect(await shadowOffsets(button)).toBe('4px 4px 0px 0px')
  })

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn()
    const screen = await render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    )

    await expect.element(screen.getByRole('button')).toBeDisabled()
    await screen.getByRole('button').click({ force: true })

    expect(onClick).not.toHaveBeenCalled()
  })

  it('is skipped by keyboard focus when disabled', async () => {
    const screen = await render(
      <>
        <Button disabled>Save</Button>
        <Button>Cancel</Button>
      </>,
    )

    await userEvent.tab()

    await expect
      .element(screen.getByRole('button', { name: 'Cancel' }))
      .toHaveFocus()
  })

  it('renders leading and trailing icons around the label', async () => {
    const screen = await render(
      <Button
        leadingIcon={<Icon />}
        trailingIcon={<svg aria-hidden="true" data-testid="trailing" />}
      >
        Next
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Next' }).element()
    expect([...button.childNodes].map((node) => node.nodeName)).toEqual([
      'svg',
      '#text',
      'svg',
    ])
  })

  it('names an icon-only button by its aria-label', async () => {
    const screen = await render(
      <Button size="icon" aria-label="Add card">
        <Icon />
      </Button>,
    )

    await expect
      .element(screen.getByRole('button', { name: 'Add card' }))
      .toBeVisible()
  })

  it('requires an accessible name for the icon-only size', () => {
    // @ts-expect-error: size="icon" needs aria-label or aria-labelledby.
    const unnamed: ButtonProps = { size: 'icon', children: <Icon /> }
    const labelled: ButtonProps = {
      size: 'icon',
      'aria-labelledby': 'label',
      children: <Icon />,
    }

    expect([unnamed, labelled]).toHaveLength(2)
  })

  it('merges a consumer className over the variant classes', async () => {
    const screen = await render(<Button className="px-400">Save</Button>)

    const button = screen.getByRole('button').element()
    expect(button.className).toContain('px-400')
    expect(button.className).not.toContain('px-250')
  })

  it.each([
    ['primary', 'rgb(248, 203, 70)'], // yellow-500
    ['secondary', 'rgb(255, 255, 255)'], // neutral-0
    ['outline', 'rgba(0, 0, 0, 0)'], // the surface shows through
  ] as const)('fills the %s variant from Figma', async (variant, fill) => {
    const screen = await render(<Button variant={variant}>Save</Button>)

    expect(
      getComputedStyle(screen.getByRole('button').element()).backgroundColor,
    ).toBe(fill)
  })

  it.each(['primary', 'secondary', 'outline'] as const)(
    'sets the %s label in the semibold 16px text preset',
    async (variant) => {
      const screen = await render(<Button variant={variant}>Save</Button>)

      const style = getComputedStyle(screen.getByRole('button').element())
      expect(style.fontSize).toBe('16px')
      expect(style.fontWeight).toBe('600')
    },
  )

  it.each([
    ['default', '48px', 'auto'],
    ['icon', '48px', '48px'],
  ] as const)('sizes %s to the spacing tokens', async (size, height, width) => {
    const screen = await render(
      size === 'icon' ? (
        <Button size="icon" aria-label="Add">
          <Icon />
        </Button>
      ) : (
        <Button>Save</Button>
      ),
    )

    const style = getComputedStyle(screen.getByRole('button').element())
    expect(style.height).toBe(height)
    if (width !== 'auto') expect(style.width).toBe(width)
  })
})
