import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

/*
 * Story files are not scanned by Tailwind, so swatches use only the color
 * utilities theme.css always generates; layout uses inline styles.
 */

const PRIMITIVES = [
  { name: 'neutral-950', hex: '#1F0D01', className: 'bg-neutral-950' },
  { name: 'neutral-900', hex: '#2E1401', className: 'bg-neutral-900' },
  { name: 'neutral-600', hex: '#6D5B4D', className: 'bg-neutral-600' },
  { name: 'neutral-300', hex: '#C4B5A8', className: 'bg-neutral-300' },
  { name: 'neutral-100', hex: '#F7F3F0', className: 'bg-neutral-100' },
  { name: 'neutral-0', hex: '#FFFFFF', className: 'bg-neutral-0' },
  { name: 'yellow-500', hex: '#F8CB46', className: 'bg-yellow-500' },
  { name: 'blue-400', hex: '#92ADEB', className: 'bg-blue-400' },
  { name: 'blue-600', hex: '#5072C7', className: 'bg-blue-600' },
  { name: 'teal-400', hex: '#47D9C9', className: 'bg-teal-400' },
  { name: 'pink-400', hex: '#FC8AE5', className: 'bg-pink-400' },
  { name: 'pink-500', hex: '#F073A3', className: 'bg-pink-500' },
  { name: 'pink-700', hex: '#E11966', className: 'bg-pink-700' },
] as const

type Primitive = (typeof PRIMITIVES)[number]['name']

const ROLES: {
  name: string
  className: string
  light: Primitive
  dark: Primitive
}[] = [
  {
    name: 'background',
    className: 'bg-background',
    light: 'neutral-100',
    dark: 'neutral-950',
  },
  {
    name: 'foreground',
    className: 'bg-foreground',
    light: 'neutral-900',
    dark: 'neutral-100',
  },
  {
    name: 'card',
    className: 'bg-card',
    light: 'neutral-0',
    dark: 'neutral-900',
  },
  {
    name: 'card-foreground',
    className: 'bg-card-foreground',
    light: 'neutral-900',
    dark: 'neutral-100',
  },
  {
    name: 'popover',
    className: 'bg-popover',
    light: 'neutral-0',
    dark: 'neutral-900',
  },
  {
    name: 'popover-foreground',
    className: 'bg-popover-foreground',
    light: 'neutral-900',
    dark: 'neutral-100',
  },
  {
    name: 'primary',
    className: 'bg-primary',
    light: 'yellow-500',
    dark: 'yellow-500',
  },
  {
    name: 'primary-foreground',
    className: 'bg-primary-foreground',
    light: 'neutral-900',
    dark: 'neutral-900',
  },
  {
    name: 'secondary',
    className: 'bg-secondary',
    light: 'neutral-0',
    dark: 'neutral-900',
  },
  {
    name: 'secondary-foreground',
    className: 'bg-secondary-foreground',
    light: 'neutral-900',
    dark: 'neutral-100',
  },
  {
    name: 'muted',
    className: 'bg-muted',
    light: 'neutral-100',
    dark: 'neutral-900',
  },
  {
    name: 'muted-foreground',
    className: 'bg-muted-foreground',
    light: 'neutral-600',
    dark: 'neutral-300',
  },
  {
    name: 'accent',
    className: 'bg-accent',
    light: 'neutral-100',
    dark: 'neutral-900',
  },
  {
    name: 'accent-foreground',
    className: 'bg-accent-foreground',
    light: 'neutral-900',
    dark: 'neutral-100',
  },
  {
    name: 'mastered',
    className: 'bg-mastered',
    light: 'teal-400',
    dark: 'teal-400',
  },
  {
    name: 'mastered-foreground',
    className: 'bg-mastered-foreground',
    light: 'neutral-900',
    dark: 'neutral-900',
  },
  {
    name: 'flashcard-question',
    className: 'bg-flashcard-question',
    light: 'pink-400',
    dark: 'pink-400',
  },
  {
    name: 'flashcard-answer',
    className: 'bg-flashcard-answer',
    light: 'blue-400',
    dark: 'blue-400',
  },
  {
    name: 'flashcard-foreground',
    className: 'bg-flashcard-foreground',
    light: 'neutral-900',
    dark: 'neutral-900',
  },
  {
    name: 'flashcard-sparkle',
    className: 'bg-flashcard-sparkle',
    light: 'yellow-500',
    dark: 'yellow-500',
  },
  {
    name: 'stat-blue',
    className: 'bg-stat-blue',
    light: 'blue-400',
    dark: 'blue-400',
  },
  {
    name: 'stat-teal',
    className: 'bg-stat-teal',
    light: 'teal-400',
    dark: 'teal-400',
  },
  {
    name: 'stat-pink',
    className: 'bg-stat-pink',
    light: 'pink-500',
    dark: 'pink-500',
  },
  {
    name: 'stat-pink-light',
    className: 'bg-stat-pink-light',
    light: 'pink-400',
    dark: 'pink-400',
  },
  {
    name: 'stat-foreground',
    className: 'bg-stat-foreground',
    light: 'neutral-900',
    dark: 'neutral-900',
  },
  {
    name: 'destructive',
    className: 'bg-destructive',
    light: 'pink-700',
    dark: 'pink-500',
  },
  {
    name: 'border',
    className: 'bg-border',
    light: 'neutral-900',
    dark: 'neutral-100',
  },
  {
    name: 'input',
    className: 'bg-input',
    light: 'neutral-900',
    dark: 'neutral-100',
  },
  { name: 'ring', className: 'bg-ring', light: 'blue-600', dark: 'blue-400' },
]

const hexOf = (name: Primitive) =>
  PRIMITIVES.find((primitive) => primitive.name === name)!.hex

/** `#RRGGBB` as the `rgb(r, g, b)` string getComputedStyle returns. */
const hexToRgbString = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

function Swatch({
  label,
  detail,
  className,
}: {
  label: string
  detail: string
  className: string
}) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        data-testid={label}
        className={`${className} border border-border`}
        style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0 }}
      />
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div>{detail}</div>
      </div>
    </li>
  )
}

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 16,
  listStyle: 'none',
  padding: 0,
  margin: 0,
} as const

function ColorFoundations() {
  return (
    <div className="text-foreground" style={{ display: 'grid', gap: 32 }}>
      <section>
        <h2>Primitives</h2>
        <p>Figma&apos;s palette. Use only for fixed accent decoration.</p>
        <ul style={grid} aria-label="Primitives">
          {PRIMITIVES.map(({ name, hex, className }) => (
            <Swatch
              key={name}
              label={name}
              detail={hex}
              className={className}
            />
          ))}
        </ul>
      </section>
      <section>
        <h2>Semantic roles</h2>
        <p>What components use. Each role points at a primitive per theme.</p>
        <ul style={grid} aria-label="Semantic roles">
          {ROLES.map(({ name, className, light, dark }) => (
            <Swatch
              key={name}
              label={name}
              detail={`light ${light} · dark ${dark}`}
              className={className}
            />
          ))}
        </ul>
      </section>
    </div>
  )
}

const meta = {
  title: 'Foundations/Color',
  component: ColorFoundations,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ColorFoundations>

export default meta
type Story = StoryObj<typeof meta>

export const Palette: Story = {
  play: async ({ canvas, globals }) => {
    const dark = globals.theme === 'dark'
    const background = (label: string) =>
      getComputedStyle(canvas.getByTestId(label)).backgroundColor

    for (const { name, hex } of PRIMITIVES) {
      await expect(background(name)).toBe(hexToRgbString(hex))
    }
    for (const role of ROLES) {
      await expect(background(role.name)).toBe(
        hexToRgbString(hexOf(dark ? role.dark : role.light)),
      )
    }
  },
}
