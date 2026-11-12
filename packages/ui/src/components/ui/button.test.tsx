import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'

// Import from the public barrel so a missing export fails the test.
import { Button } from '../../index.js'

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

  it('merges a consumer className over the variant classes', async () => {
    const screen = await render(<Button className="px-400">Save</Button>)

    const button = screen.getByRole('button').element()
    expect(button.className).toContain('px-400')
    expect(button.className).not.toContain('px-125')
  })

  it.each([
    ['xs', '20px', '8px'],
    ['sm', '24px', '8px'],
    ['default', '32px', '10px'],
    ['lg', '40px', '10px'],
  ] as const)(
    'sizes %s to the spacing and radius tokens (%s tall, %s radius)',
    async (size, height, radius) => {
      const screen = await render(<Button size={size}>Save</Button>)

      const style = getComputedStyle(screen.getByRole('button').element())
      expect(style.height).toBe(height)
      expect(style.borderTopLeftRadius).toBe(radius)
    },
  )
})
