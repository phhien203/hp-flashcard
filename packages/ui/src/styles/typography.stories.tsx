import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

// The Figma text presets (Typography style guide, node 300:47).
const presets = [
  { className: 'text-preset-1', spec: 'Bold · 24 / 32 (md) / 40 (lg) · 120%' },
  { className: 'text-preset-2', spec: 'SemiBold · 24 · 120%' },
  { className: 'text-preset-3', spec: 'SemiBold · 20 · 120%' },
  { className: 'text-preset-4-semibold', spec: 'SemiBold · 16 · 120%' },
  { className: 'text-preset-4-medium', spec: 'Medium · 16 · 120%' },
  { className: 'text-preset-4-regular', spec: 'Regular · 16 · 140%' },
  { className: 'text-preset-5-medium', spec: 'Medium · 14 · 140%' },
  { className: 'text-preset-5-regular', spec: 'Regular · 14 · 140%' },
  { className: 'text-preset-6', spec: 'Medium · 12 · 130% · −3%' },
] as const

const meta = {
  title: 'Foundations/Typography',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const TextPresets: Story = {
  render: () => (
    <dl className="grid gap-300 text-foreground">
      {presets.map(({ className, spec }) => (
        <div key={className} className="grid gap-50">
          <dt className="text-preset-5-regular text-muted-foreground">
            <code>{className}</code> · Poppins {spec}
          </dt>
          <dd className={className}>
            The quick brown fox jumps over the lazy dog
          </dd>
        </div>
      ))}
    </dl>
  ),
  play: async ({ canvas }) => {
    for (const { className } of presets) {
      await expect(canvas.getByText(className)).toBeVisible()
    }
    await expect(
      canvas.getAllByText('The quick brown fox jumps over the lazy dog'),
    ).toHaveLength(presets.length)
  },
}
