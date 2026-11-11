import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'

import { Button } from './button.js'

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
    const screen = await render(<Button className="px-8">Save</Button>)

    const button = screen.getByRole('button').element()
    expect(button.className).toContain('px-8')
    expect(button.className).not.toContain('px-2.5')
  })
})
