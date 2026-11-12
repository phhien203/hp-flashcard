import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'

// Import from the public barrel so a missing export fails the test.
import { Textarea } from '../../index.js'

describe('Textarea', () => {
  it('renders a multi-line textbox named by aria-label', async () => {
    const screen = await render(<Textarea aria-label="Answer" />)

    const textarea = screen.getByRole('textbox', { name: 'Answer' })
    await expect.element(textarea).toBeVisible()
    expect(textarea.element().tagName).toBe('TEXTAREA')
  })

  it('keeps line breaks and reports them through onValueChange', async () => {
    const onValueChange = vi.fn()
    const screen = await render(
      <Textarea aria-label="Answer" onValueChange={onValueChange} />,
    )

    await screen.getByRole('textbox').fill('Paris\nFrance')

    await expect
      .element(screen.getByRole('textbox'))
      .toHaveValue('Paris\nFrance')
    expect(onValueChange).toHaveBeenLastCalledWith(
      'Paris\nFrance',
      expect.anything(),
    )
  })

  it('starts from defaultValue', async () => {
    const screen = await render(
      <Textarea aria-label="Answer" defaultValue="Paris" />,
    )

    await expect.element(screen.getByRole('textbox')).toHaveValue('Paris')
  })

  it('works as a controlled component with onChange', async () => {
    function Example() {
      const [value, setValue] = useState('Par')
      return (
        <Textarea
          aria-label="Answer"
          value={value}
          onChange={(event) => setValue(event.target.value.toUpperCase())}
        />
      )
    }
    const screen = await render(<Example />)

    await screen.getByRole('textbox').fill('paris')

    await expect.element(screen.getByRole('textbox')).toHaveValue('PARIS')
  })

  it('passes textarea attributes such as rows through', async () => {
    const screen = await render(<Textarea aria-label="Answer" rows={6} />)

    await expect
      .element(screen.getByRole('textbox'))
      .toHaveAttribute('rows', '6')
  })

  it('uses the destructive border when aria-invalid', async () => {
    const screen = await render(<Textarea aria-label="Answer" aria-invalid />)

    expect(
      getComputedStyle(screen.getByRole('textbox').element()).borderTopColor,
    ).toBe('rgb(225, 25, 102)')
  })
})
