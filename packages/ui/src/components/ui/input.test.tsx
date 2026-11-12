import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'

// Import from the public barrel so a missing export fails the test.
import { Field, Input } from '../../index.js'

const borderColor = (element: Element) =>
  getComputedStyle(element).borderTopColor

describe('Input', () => {
  it('renders a textbox named by aria-label outside a Field', async () => {
    const screen = await render(<Input aria-label="Search cards" />)

    await expect
      .element(screen.getByRole('textbox', { name: 'Search cards' }))
      .toBeVisible()
  })

  it('reports typed text through onValueChange and onChange', async () => {
    const onValueChange = vi.fn()
    const onChange = vi.fn()
    const screen = await render(
      <Input
        aria-label="Question"
        onValueChange={onValueChange}
        onChange={onChange}
      />,
    )

    await screen.getByRole('textbox').fill('Hi')

    expect(onValueChange).toHaveBeenLastCalledWith('Hi', expect.anything())
    expect(onChange).toHaveBeenCalled()
    await expect.element(screen.getByRole('textbox')).toHaveValue('Hi')
  })

  it('shows its placeholder in muted-foreground', async () => {
    const screen = await render(
      <Input aria-label="Question" placeholder="e.g. Capital of France?" />,
    )

    const input = screen.getByPlaceholder('e.g. Capital of France?')
    // neutral-600 is #6d5b4d.
    expect(getComputedStyle(input.element(), '::placeholder').color).toBe(
      'rgb(109, 91, 77)',
    )
  })

  it('is disabled when disabled', async () => {
    const screen = await render(<Input aria-label="Question" disabled />)

    await expect.element(screen.getByRole('textbox')).toBeDisabled()
  })

  it('uses the input border by default and the destructive border when aria-invalid', async () => {
    const screen = await render(
      <>
        <Input aria-label="Valid" />
        <Input aria-label="Invalid" aria-invalid />
      </>,
    )

    // neutral-900 is #2e1401, pink-700 is #e11966.
    expect(borderColor(screen.getByLabelText('Valid').element())).toBe(
      'rgb(46, 20, 1)',
    )
    expect(borderColor(screen.getByLabelText('Invalid').element())).toBe(
      'rgb(225, 25, 102)',
    )
  })

  it('raises its hard shadow from 2px to 4px on hover', async () => {
    const screen = await render(<Input aria-label="Question" />)
    const input = screen.getByRole('textbox')
    const shadow = () => getComputedStyle(input.element()).boxShadow

    expect(shadow()).toContain('2px 2px 0px 0px')
    await input.hover()

    await expect.poll(shadow).toContain('4px 4px 0px 0px')
    await input.unhover()
  })

  it('casts its hard shadow in the destructive color when invalid', async () => {
    const screen = await render(
      <>
        <Input aria-label="Valid" />
        <Input aria-label="Invalid" aria-invalid />
      </>,
    )
    const shadow = (label: string) =>
      getComputedStyle(screen.getByLabelText(label).element()).boxShadow

    // neutral-900 at rest. Chromium reports the pink-700 shadow in oklab.
    expect(shadow('Valid')).toContain('rgb(46, 20, 1) 2px 2px 0px 0px')
    expect(shadow('Invalid')).toContain('2px 2px 0px 0px')
    expect(shadow('Invalid')).not.toContain('rgb(46, 20, 1)')
  })

  it('takes the destructive border from an invalid Field', async () => {
    const screen = await render(
      <Field invalid>
        <Input aria-label="Question" />
      </Field>,
    )

    expect(borderColor(screen.getByRole('textbox').element())).toBe(
      'rgb(225, 25, 102)',
    )
  })

  it('shows the ring border on keyboard focus, even when invalid', async () => {
    const screen = await render(
      <>
        <button type="button">Before</button>
        <Input aria-label="Question" aria-invalid />
      </>,
    )

    await screen.getByRole('button').click()
    await userEvent.tab()

    const input = screen.getByRole('textbox').element()
    expect(document.activeElement).toBe(input)
    // blue-600 is #5072c7.
    expect(borderColor(input)).toBe('rgb(80, 114, 199)')
  })

  it('merges a consumer className over its own classes', async () => {
    const screen = await render(<Input aria-label="Q" className="px-400" />)

    const input = screen.getByRole('textbox').element()
    expect(input.className).toContain('px-400')
    expect(input.className).not.toContain('px-200')
  })
})
