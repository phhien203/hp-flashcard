import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { createIcon } from '../icons/create-icon.js'
import { settle } from '../../test/settle.js'
import { Button } from './button.js'

// Sample icons for the stories only; the Figma icon set ships separately.
const ArrowLeft = createIcon(
  'ArrowLeft',
  '0 0 16 16',
  <path d="M7.3 2.3a1 1 0 0 1 1.4 1.4L5.4 7H13a1 1 0 1 1 0 2H5.4l3.3 3.3a1 1 0 0 1-1.4 1.4l-5-5a1 1 0 0 1 0-1.4l5-5Z" />,
)
const ArrowRight = createIcon(
  'ArrowRight',
  '0 0 16 16',
  <path d="M8.7 2.3a1 1 0 0 0-1.4 1.4L10.6 7H3a1 1 0 1 0 0 2h7.6l-3.3 3.3a1 1 0 0 0 1.4 1.4l5-5a1 1 0 0 0 0-1.4l-5-5Z" />,
)
const Plus = createIcon(
  'Plus',
  '0 0 16 16',
  <path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 0 1 0-2h4V3a1 1 0 0 1 1-1Z" />,
)

/** A CSS color as the browser resolves it, for comparing with styles. */
const resolved = (css: string) => {
  const probe = document.createElement('div')
  probe.style.color = css
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

const row = { display: 'flex', alignItems: 'center', gap: 24 } as const

const meta = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  args: {
    children: 'Next card',
    onClick: fn(),
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline'],
    },
    size: { control: 'select', options: ['default', 'icon'] },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Next card' }))
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
}

export const Secondary: Story = { args: { variant: 'secondary' } }

export const Outline: Story = { args: { variant: 'outline' } }

export const KeyboardFocus: Story = {
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole('button')

    await userEvent.tab()
    await expect(button).toHaveFocus()
    await settle(button)
    const style = getComputedStyle(button)
    await expect(style.borderTopColor).toBe(resolved('var(--ring)'))
    // Tailwind's shadow-color utilities mix the color in oklab, so the
    // shadow's color serializes in that space.
    await expect(style.boxShadow).toContain(
      resolved('color-mix(in oklab, var(--ring) 100%, transparent)'),
    )
  },
}

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole('button')
    await expect(button).toBeDisabled()
    await expect(getComputedStyle(button).opacity).toBe('0.5')

    // pointer-events: none blocks a real pointer, so dispatch the click.
    button.click()
    await expect(args.onClick).not.toHaveBeenCalled()
  },
}

export const LeadingIcon: Story = {
  args: {
    variant: 'secondary',
    children: 'Previous',
    leadingIcon: <ArrowLeft />,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Previous' }),
    ).toBeInTheDocument()
  },
}

export const TrailingIcon: Story = {
  args: { children: 'Next', trailingIcon: <ArrowRight /> },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Next' }),
    ).toBeInTheDocument()
  },
}

export const IconOnly: Story = {
  args: { size: 'icon', 'aria-label': 'Add card', children: <Plus /> },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Add card' }))
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
}

/** Every variant at rest and disabled, with and without icons. */
export const AllStates: Story = {
  render: ({ onClick }) => (
    <div style={{ display: 'grid', gap: 24 }}>
      {(['primary', 'secondary', 'outline'] as const).map((variant) => (
        <div key={variant} style={row}>
          <Button onClick={onClick} variant={variant}>
            {variant}
          </Button>
          <Button
            onClick={onClick}
            variant={variant}
            leadingIcon={<ArrowLeft />}
            trailingIcon={<ArrowRight />}
          >
            Icons
          </Button>
          <Button
            onClick={onClick}
            variant={variant}
            size="icon"
            aria-label={`Add (${variant})`}
          >
            <Plus />
          </Button>
          <Button onClick={onClick} variant={variant} disabled>
            Disabled
          </Button>
        </div>
      ))}
    </div>
  ),
}
