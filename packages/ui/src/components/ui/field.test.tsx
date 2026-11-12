import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'

// Import from the public barrel so a missing export fails the test.
import { Field, FieldError, FieldLabel, Input, Textarea } from '../../index.js'

describe('Field', () => {
  it('labels its input', async () => {
    const screen = await render(
      <Field>
        <FieldLabel>Question</FieldLabel>
        <Input />
      </Field>,
    )

    await expect
      .element(screen.getByRole('textbox', { name: 'Question' }))
      .toBeVisible()
  })

  it('labels its textarea', async () => {
    const screen = await render(
      <Field>
        <FieldLabel>Answer</FieldLabel>
        <Textarea />
      </Field>,
    )

    const textarea = screen.getByRole('textbox', { name: 'Answer' })
    await expect.element(textarea).toBeVisible()
    expect(textarea.element().tagName).toBe('TEXTAREA')
  })

  it('focuses the control when its label is clicked', async () => {
    const screen = await render(
      <Field>
        <FieldLabel>Question</FieldLabel>
        <Input />
      </Field>,
    )

    await screen.getByText('Question').click()

    await expect.element(screen.getByRole('textbox')).toHaveFocus()
  })

  it('hides the error while the field is valid', async () => {
    const screen = await render(
      <Field>
        <FieldLabel>Question</FieldLabel>
        <Input />
        <FieldError>Please enter a question.</FieldError>
      </Field>,
    )

    expect(screen.getByRole('alert').query()).toBeNull()
    await expect
      .element(screen.getByRole('textbox'))
      .not.toHaveAttribute('aria-invalid')
  })

  it('marks the control invalid and describes it with the error', async () => {
    const screen = await render(
      <Field invalid>
        <FieldLabel>Question</FieldLabel>
        <Input />
        <FieldError match>Please enter a question.</FieldError>
      </Field>,
    )

    const input = screen.getByRole('textbox', { name: 'Question' })
    await expect.element(input).toHaveAttribute('aria-invalid', 'true')
    await expect
      .element(input)
      .toHaveAccessibleDescription('Please enter a question.')
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Please enter a question.')
  })

  it('shows the error when a required field is cleared and left', async () => {
    const screen = await render(
      <Field validationMode="onBlur">
        <FieldLabel>Answer</FieldLabel>
        <Textarea required />
        <FieldError>Please enter an answer.</FieldError>
      </Field>,
    )

    const textarea = screen.getByRole('textbox', { name: 'Answer' })
    await textarea.fill('Paris')
    await textarea.clear()
    await userEvent.tab()

    await expect.element(textarea).toHaveAttribute('aria-invalid', 'true')
    await expect
      .element(textarea)
      .toHaveAccessibleDescription('Please enter an answer.')
  })

  it('removes the error once the field becomes valid', async () => {
    function Example() {
      const [value, setValue] = useState('')
      return (
        <Field invalid={value === ''}>
          <FieldLabel>Question</FieldLabel>
          <Input value={value} onValueChange={setValue} />
          <FieldError match={value === ''}>Please enter a question.</FieldError>
        </Field>
      )
    }
    const screen = await render(<Example />)

    await expect.element(screen.getByRole('alert')).toBeVisible()
    await screen.getByRole('textbox').fill('Capital of France?')

    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('textbox'))
      .not.toHaveAttribute('aria-invalid')
  })

  it('shows the error icon without exposing it to assistive technology', async () => {
    const screen = await render(
      <Field invalid>
        <FieldLabel>Question</FieldLabel>
        <Input />
        <FieldError match>Please enter a question.</FieldError>
      </Field>,
    )

    const icon = screen.getByRole('alert').element().querySelector('svg')!
    expect(icon).not.toBeNull()
    expect(icon.getAttribute('aria-hidden')).toBe('true')
  })

  it('colors the error message with pink-700 in light', async () => {
    const screen = await render(
      <Field invalid>
        <FieldLabel>Question</FieldLabel>
        <Input />
        <FieldError match>Please enter a question.</FieldError>
      </Field>,
    )

    // pink-700 is #e11966.
    expect(getComputedStyle(screen.getByRole('alert').element()).color).toBe(
      'rgb(225, 25, 102)',
    )
  })
})
