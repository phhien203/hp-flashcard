import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

// Class names are spelled out in full so Tailwind can find them.
const SPACING = [
  { token: 'spacing-0', value: '0px', bar: 'w-0' },
  { token: 'spacing-25', value: '2px', bar: 'w-25' },
  { token: 'spacing-50', value: '4px', bar: 'w-50' },
  { token: 'spacing-75', value: '6px', bar: 'w-75' },
  { token: 'spacing-100', value: '8px', bar: 'w-100' },
  { token: 'spacing-125', value: '10px', bar: 'w-125' },
  { token: 'spacing-150', value: '12px', bar: 'w-150' },
  { token: 'spacing-200', value: '16px', bar: 'w-200' },
  { token: 'spacing-250', value: '20px', bar: 'w-250' },
  { token: 'spacing-300', value: '24px', bar: 'w-300' },
  { token: 'spacing-400', value: '32px', bar: 'w-400' },
  { token: 'spacing-500', value: '40px', bar: 'w-500' },
  { token: 'spacing-600', value: '48px', bar: 'w-600' },
  { token: 'spacing-800', value: '64px', bar: 'w-800' },
  { token: 'spacing-1000', value: '80px', bar: 'w-1000' },
  { token: 'spacing-1200', value: '96px', bar: 'w-1200' },
  { token: 'spacing-1400', value: '112px', bar: 'w-1400' },
  { token: 'spacing-1600', value: '128px', bar: 'w-1600' },
  { token: 'spacing-1800', value: '140px', bar: 'w-1800' },
]

const NAMED_SIZES = [
  { token: 'container-dialog', value: '600px', bar: 'w-dialog' },
  { token: 'container-page', value: '1240px', bar: 'w-page' },
]

type Token = { token: string; value: string; bar: string }

function TokenTable({ caption, tokens }: { caption: string; tokens: Token[] }) {
  return (
    <table className="border-collapse text-left text-sm text-foreground">
      <caption className="pb-100 text-left font-medium">{caption}</caption>
      <thead>
        <tr>
          <th className="pr-300 pb-100">Token</th>
          <th className="pr-300 pb-100">Value</th>
          <th className="pb-100">Preview</th>
        </tr>
      </thead>
      <tbody>
        {tokens.map(({ token, value, bar }) => (
          <tr key={token}>
            <td className="py-50 pr-300 font-mono">{token}</td>
            <td className="py-50 pr-300 font-mono">{value}</td>
            <td className="py-50">
              <div
                aria-hidden
                data-token={token}
                className={`h-200 rounded-4 bg-primary ${bar}`}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

async function expectBarWidths(canvasElement: HTMLElement, tokens: Token[]) {
  for (const { token, value } of tokens) {
    const bar = canvasElement.querySelector(`[data-token="${token}"]`)
    await expect(bar).not.toBeNull()
    await expect(getComputedStyle(bar!).width).toBe(value)
  }
}

const meta = {
  title: 'Foundations/Spacing',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** `spacing/*` from Figma, with 100 = 8px. Drives `p-*`, `m-*`, `gap-*`, `w-*`, `h-*`, `size-*` and `inset-*`. */
export const Scale: Story = {
  render: () => <TokenTable caption="Spacing scale" tokens={SPACING} />,
  play: async ({ canvasElement }) => {
    await expectBarWidths(canvasElement, SPACING)
  },
}

/** Named sizes for widths off the spacing scale: `w-*`, `max-w-*` and `min-w-*`. */
export const NamedSizes: Story = {
  render: () => <TokenTable caption="Named sizes" tokens={NAMED_SIZES} />,
  play: async ({ canvasElement }) => {
    await expectBarWidths(canvasElement, NAMED_SIZES)
  },
}
