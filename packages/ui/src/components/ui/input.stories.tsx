import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { Input } from './input.js'

const meta = {
  title: 'Components/Input',
  component: Input,
  tags: ['autodocs'],
  args: {
    'aria-label': 'Question',
    placeholder: 'e.g. What is the capital of France?',
    onValueChange: fn(),
  },
  // The error border and message are drawn for white (card) surfaces.
  decorators: [
    (Story) => (
      <div className="max-w-dialog bg-card p-300">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const input = canvas.getByRole('textbox', { name: 'Question' })
    await userEvent.type(input, 'Paris')
    await expect(input).toHaveValue('Paris')
    await expect(args.onValueChange).toHaveBeenLastCalledWith(
      'Paris',
      expect.anything(),
    )
  },
}

/**
 * Point at the control to see the hover shadow. A play function can't show
 * it: Storybook's simulated hover doesn't match CSS `:hover`, so the unit
 * test checks it with a real pointer.
 */
export const Hover: Story = {
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('textbox')
    await userEvent.hover(input)
    await expect(input).toBeEnabled()
  },
}

export const KeyboardFocus: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab()
    await expect(canvas.getByRole('textbox')).toHaveFocus()
  },
}

export const Error: Story = {
  args: { 'aria-invalid': true, defaultValue: 'Pariss' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox')).toBeInvalid()
  },
}

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox')).toBeDisabled()
  },
}
