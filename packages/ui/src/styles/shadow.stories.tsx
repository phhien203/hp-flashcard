import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

/*
 * Story files are not scanned by Tailwind, so samples use only the shadow
 * utilities theme.css always generates; layout uses inline styles.
 */

const box = {
  width: 160,
  height: 96,
  borderRadius: 12,
  display: 'grid',
  placeItems: 'center',
  font: 'inherit',
} as const

/** Any CSS color (rgb, oklab, hex…) as [r, g, b], via a canvas. */
const toChannels = (color: string) => {
  const context = document.createElement('canvas').getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)]
}

/** The token shadow, the last layer after Tailwind's empty ring layers. */
const tokenShadow = (element: HTMLElement) => {
  const layers = getComputedStyle(element).boxShadow.match(
    /(?:[a-z]+\([^)]*\)|[^,])+/g,
  )!
  const layer = layers.at(-1)!.trim()
  const color = layer.match(/^[a-z]+\([^)]*\)/)![0]
  return { color: toChannels(color), offsets: layer.slice(color.length).trim() }
}

/** The value a theme token resolves to on the preview root, as [r, g, b]. */
const token = (name: string) =>
  toChannels(getComputedStyle(document.documentElement).getPropertyValue(name))

/** Colors match within rounding (oklab round trips can be off by one). */
const expectColor = async (actual: number[], expected: number[]) => {
  for (const [i, channel] of expected.entries()) {
    await expect(Math.abs((actual[i] ?? NaN) - channel)).toBeLessThanOrEqual(1)
  }
}

function ShadowFoundations() {
  return (
    <div
      className="text-foreground"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}
    >
      <div className="border border-border bg-card shadow-rest" style={box}>
        shadow-rest
      </div>
      <div className="border border-border bg-card shadow-hover" style={box}>
        shadow-hover
      </div>
      <button
        type="button"
        className="border border-border bg-card text-foreground shadow-rest outline-none hover:shadow-hover focus-visible:border-ring focus-visible:shadow-ring"
        style={box}
      >
        Hover or tab to me
      </button>
    </div>
  )
}

const meta = {
  title: 'Foundations/Shadow',
  component: ShadowFoundations,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ShadowFoundations>

export default meta
type Story = StoryObj<typeof meta>

export const Shadows: Story = {
  play: async ({ canvas, userEvent, step }) => {
    const rest = canvas.getByText('shadow-rest')
    const hover = canvas.getByText('shadow-hover')
    const sample = canvas.getByRole('button', { name: 'Hover or tab to me' })
    const shadow = token('--shadow-color')
    const ring = token('--ring')

    await step('shadows are hard offsets in --shadow-color', async () => {
      await expect(tokenShadow(rest).offsets).toBe('2px 2px 0px 0px')
      await expectColor(tokenShadow(rest).color, shadow)
      await expect(tokenShadow(hover).offsets).toBe('4px 4px 0px 0px')
      await expectColor(tokenShadow(hover).color, shadow)
      await expectColor(tokenShadow(sample).color, shadow)
    })

    // Mouse focus is covered by the unit test, which drives real pointer
    // events: the synthetic click here focuses the element programmatically,
    // and that matches :focus-visible.
    await step(
      'keyboard focus switches shadow and border to ring',
      async () => {
        await userEvent.tab()
        await expect(sample).toHaveFocus()
        await expectColor(tokenShadow(sample).color, ring)
        await expectColor(
          toChannels(getComputedStyle(sample).borderTopColor),
          ring,
        )
      },
    )
  },
}
