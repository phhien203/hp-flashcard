import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'

// Import from the public barrel so a missing export fails the test.
import { StatTile, type StatTileProps } from '../../index.js'

const stat = {
  label: 'Mastered',
  value: 11,
  icon: <svg data-testid="icon" />,
  accent: 'teal-400',
} satisfies StatTileProps

const renderTile = (props: Partial<StatTileProps> = {}) =>
  render(<StatTile {...stat} {...props} />)

const panelOf = (icon: Element) =>
  icon.closest('[aria-hidden="true"]') as HTMLElement

describe('StatTile', () => {
  it('is a group named by its label, holding the value', async () => {
    const screen = await renderTile()

    const tile = screen.getByRole('group', { name: 'Mastered' })
    await expect.element(tile).toBeVisible()
    await expect.element(tile.getByText('11', { exact: true })).toBeVisible()
  })

  it('hides the icon from assistive technology', async () => {
    const screen = await renderTile()

    const icon = screen.getByTestId('icon').element()
    expect(panelOf(icon)).not.toBeNull()
  })

  it.each([
    ['blue-400', 'rgb(146, 173, 235)'],
    ['teal-400', 'rgb(71, 217, 201)'],
    ['pink-500', 'rgb(240, 115, 163)'],
    ['pink-400', 'rgb(252, 138, 229)'],
  ] as const)(
    'paints the %s panel with a neutral-900 icon in both themes',
    async (accent, color) => {
      const screen = await render(
        <>
          <StatTile {...stat} accent={accent} />
          <div className="dark">
            <StatTile
              {...stat}
              accent={accent}
              icon={<svg data-testid="dark-icon" />}
            />
          </div>
        </>,
      )

      for (const id of ['icon', 'dark-icon']) {
        const panel = panelOf(screen.getByTestId(id).element())
        const style = getComputedStyle(panel)
        expect(style.backgroundColor).toBe(color)
        expect(style.color).toBe('rgb(46, 20, 1)') // neutral-900
      }
    },
  )

  it('follows the theme outside the panel', async () => {
    const screen = await render(
      <div className="dark">
        <StatTile {...stat} />
      </div>,
    )

    const tile = screen.getByRole('group').element()
    expect(getComputedStyle(tile).backgroundColor).toBe('rgb(46, 20, 1)') // neutral-900 card
    expect(getComputedStyle(tile).color).toBe('rgb(247, 243, 240)') // neutral-100
  })

  it('keeps a long label and the panel inside a narrow tile', async () => {
    const label = 'Supercalifragilisticexpialidocious'.repeat(3)
    const screen = await render(
      <div style={{ width: '280px' }}>
        <StatTile {...stat} label={label} />
      </div>,
    )

    const tile = screen.getByRole('group').element().getBoundingClientRect()
    const text = screen.getByText(label).element().getBoundingClientRect()
    const panel = panelOf(
      screen.getByTestId('icon').element(),
    ).getBoundingClientRect()
    expect(text.right).toBeLessThanOrEqual(tile.right)
    expect(panel.right).toBeLessThanOrEqual(tile.right)
  })

  it('passes props such as className to the tile', async () => {
    const screen = await renderTile({ className: 'max-w-dialog', id: 'stat' })

    const tile = screen.getByRole('group').element()
    expect(tile.classList.contains('max-w-dialog')).toBe(true)
    expect(tile.id).toBe('stat')
  })
})
