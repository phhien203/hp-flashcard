import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'

// Import from the public barrel so a missing export fails the test.
import { Field, Textarea } from '../../index.js'

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

  it('raises its hard shadow from 2px to 4px on hover', async () => {
    const screen = await render(<Textarea aria-label="Answer" />)
    const textarea = screen.getByRole('textbox')
    const shadow = () => getComputedStyle(textarea.element()).boxShadow

    expect(shadow()).toContain('2px 2px 0px 0px')
    await textarea.hover()

    await expect.poll(shadow).toContain('4px 4px 0px 0px')
    await textarea.unhover()
  })

  it('takes the destructive border from an invalid Field', async () => {
    const screen = await render(
      <Field invalid>
        <Textarea aria-label="Answer" />
      </Field>,
    )

    expect(
      getComputedStyle(screen.getByRole('textbox').element()).borderTopColor,
    ).toBe('rgb(225, 25, 102)')
  })

  it('shows the ring border on keyboard focus, even when invalid', async () => {
    const screen = await render(
      <>
        <button type="button">Before</button>
        <Textarea aria-label="Answer" aria-invalid />
      </>,
    )

    await screen.getByRole('button').click()
    await userEvent.tab()

    const textarea = screen.getByRole('textbox').element()
    expect(document.activeElement).toBe(textarea)
    // blue-600 is #5072c7.
    expect(getComputedStyle(textarea).borderTopColor).toBe('rgb(80, 114, 199)')
  })
})
