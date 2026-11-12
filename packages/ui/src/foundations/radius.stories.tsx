import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

// Class names are spelled out in full so Tailwind can find them.
const RADIUS = [
  { token: 'radius-0', value: '0px', swatch: 'rounded-0' },
  { token: 'radius-4', value: '4px', swatch: 'rounded-4' },
  { token: 'radius-6', value: '6px', swatch: 'rounded-6' },
  { token: 'radius-8', value: '8px', swatch: 'rounded-8' },
  { token: 'radius-10', value: '10px', swatch: 'rounded-10' },
  { token: 'radius-12', value: '12px', swatch: 'rounded-12' },
  { token: 'radius-16', value: '16px', swatch: 'rounded-16' },
  { token: 'radius-20', value: '20px', swatch: 'rounded-20' },
  { token: 'radius-24', value: '24px', swatch: 'rounded-24' },
  { token: 'radius-full', value: '999px', swatch: 'rounded-full' },
]

const meta = {
  title: 'Foundations/Radius',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** `corner-radius/*` from Figma, used as `rounded-*` (and `rounded-t-*`, `rounded-s-*` …). */
export const Scale: Story = {
  render: () => (
    <ul className="flex flex-wrap gap-300 text-sm text-foreground">
      {RADIUS.map(({ token, value, swatch }) => (
        <li key={token} className="flex flex-col items-center gap-100">
          <div
            aria-hidden
            data-token={token}
            className={`size-1200 border-2 border-primary bg-muted ${swatch}`}
          />
          <span className="font-mono">{token}</span>
          <span className="font-mono">{value}</span>
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvasElement }) => {
    for (const { token, value } of RADIUS) {
      const swatch = canvasElement.querySelector(`[data-token="${token}"]`)
      await expect(swatch).not.toBeNull()
      await expect(getComputedStyle(swatch!).borderTopLeftRadius).toBe(value)
    }
  },
}
