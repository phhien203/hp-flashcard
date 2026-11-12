import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Field, FieldError, FieldLabel } from './field.js'
import { Input } from './input.js'
import { Textarea } from './textarea.js'

const meta = {
  title: 'Components/Field',
  component: Field,
  tags: ['autodocs'],
  // The error message is pink-700 on white: it keeps AA contrast only on
  // card surfaces.
  decorators: [
    (Story) => (
      <div className="max-w-dialog bg-card p-300">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Field>

export default meta
type Story = StoryObj<typeof meta>

export const WithInput: Story = {
  render: (args) => (
    <Field {...args}>
      <FieldLabel>Question</FieldLabel>
      <Input placeholder="e.g. What is the capital of France?" />
      <FieldError>Please enter a question.</FieldError>
    </Field>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText('Question'))
    await expect(
      canvas.getByRole('textbox', { name: 'Question' }),
    ).toHaveFocus()
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
  },
}

export const WithTextarea: Story = {
  render: (args) => (
    <Field {...args}>
      <FieldLabel>Answer</FieldLabel>
      <Textarea placeholder="e.g. Paris" />
      <FieldError>Please enter an answer.</FieldError>
    </Field>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Answer' })).toBeVisible()
  },
}

export const Error: Story = {
  args: { invalid: true },
  render: (args) => (
    <Field {...args}>
      <FieldLabel>Question</FieldLabel>
      <Input placeholder="e.g. What is the capital of France?" />
      <FieldError match>Please enter a question.</FieldError>
    </Field>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByRole('textbox', { name: 'Question' })
    await expect(input).toBeInvalid()
    await expect(input).toHaveAccessibleDescription('Please enter a question.')
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Please enter a question.',
    )
  },
}

export const TextareaError: Story = {
  args: { invalid: true },
  render: (args) => (
    <Field {...args}>
      <FieldLabel>Answer</FieldLabel>
      <Textarea placeholder="e.g. Paris" />
      <FieldError match>Please enter an answer.</FieldError>
    </Field>
  ),
  play: async ({ canvas }) => {
    const textarea = canvas.getByRole('textbox', { name: 'Answer' })
    await expect(textarea).toBeInvalid()
    await expect(textarea).toHaveAccessibleDescription(
      'Please enter an answer.',
    )
  },
}

/** Native constraints (here `required`) drive the error state on blur. */
export const ValidateOnBlur: Story = {
  args: { validationMode: 'onBlur' },
  render: (args) => (
    <Field {...args}>
      <FieldLabel>Question</FieldLabel>
      <Input required placeholder="e.g. What is the capital of France?" />
      <FieldError>Please enter a question.</FieldError>
    </Field>
  ),
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('textbox', { name: 'Question' })
    await userEvent.type(input, 'Paris')
    await userEvent.clear(input)
    await userEvent.tab()

    await expect(input).toBeInvalid()
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Please enter a question.',
    )

    await userEvent.type(input, 'Capital of France?')
    await userEvent.tab()
    await expect(input).toBeValid()
  },
}
