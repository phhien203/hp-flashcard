import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { Checkbox } from './checkbox.js'

const meta = {
  title: 'Components/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  args: {
    onCheckedChange: fn(),
  },
  render: (args) => (
    <label className="flex cursor-pointer items-center gap-100 text-preset-5-medium text-foreground">
      <Checkbox {...args} />
      Hide Mastered
    </label>
  ),
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

export const Unchecked: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const checkbox = canvas.getByRole('checkbox', { name: 'Hide Mastered' })
    await expect(checkbox).not.toBeChecked()

    await userEvent.click(checkbox)

    await expect(checkbox).toBeChecked()
    await expect(args.onCheckedChange).toHaveBeenCalledOnce()
    await expect(args.onCheckedChange).toHaveBeenCalledWith(
      true,
      expect.anything(),
    )
  },
}

export const Checked: Story = {
  args: { defaultChecked: true },
  play: async ({ canvas, userEvent }) => {
    const checkbox = canvas.getByRole('checkbox', { name: 'Hide Mastered' })
    await expect(checkbox).toBeChecked()

    await userEvent.click(checkbox)

    await expect(checkbox).not.toBeChecked()
  },
}

export const LabelClick: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText('Hide Mastered'))

    await expect(canvas.getByRole('checkbox')).toBeChecked()
  },
}

export const KeyboardFocus: Story = {
  play: async ({ canvas, userEvent }) => {
    const checkbox = canvas.getByRole('checkbox', { name: 'Hide Mastered' })

    await userEvent.tab()
    await expect(checkbox).toHaveFocus()

    await userEvent.keyboard(' ')
    await expect(checkbox).toBeChecked()
  },
}

/** Hover and keyboard focus side by side, pinned with the pseudo-state classes. */
export const States: Story = {
  render: (args) => (
    <div className="flex flex-col gap-200">
      {[false, true].map((checked) => (
        <div key={String(checked)} className="flex items-center gap-300">
          {(['Rest', 'Hover', 'Focus'] as const).map((state) => (
            <label
              key={state}
              className="flex items-center gap-100 text-preset-5-medium whitespace-nowrap text-foreground"
            >
              <Checkbox
                {...args}
                defaultChecked={checked}
                className={
                  state === 'Hover'
                    ? 'shadow-rest'
                    : state === 'Focus'
                      ? 'border-ring ring-3 shadow-ring ring-ring/50'
                      : undefined
                }
              />
              {checked ? 'Checked' : 'Unchecked'} {state.toLowerCase()}
            </label>
          ))}
        </div>
      ))}
    </div>
  ),
}
