import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'

// Import from the public barrel so a missing export fails the test.
import { Checkbox, type CheckboxProps } from '../../index.js'

function Labelled(props: CheckboxProps) {
  return (
    <label>
      <Checkbox {...props} />
      Hide Mastered
    </label>
  )
}

describe('Checkbox', () => {
  it('is a checkbox named by its label, unchecked by default', async () => {
    const screen = await render(<Labelled />)

    const checkbox = screen.getByRole('checkbox', { name: 'Hide Mastered' })
    await expect.element(checkbox).toBeVisible()
    await expect.element(checkbox).not.toBeChecked()
  })

  it('toggles uncontrolled on click and reports each change', async () => {
    const onCheckedChange = vi.fn()
    const screen = await render(<Labelled onCheckedChange={onCheckedChange} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Hide Mastered' })

    await checkbox.click()
    await expect.element(checkbox).toBeChecked()
    expect(onCheckedChange).toHaveBeenLastCalledWith(true, expect.anything())

    await checkbox.click()
    await expect.element(checkbox).not.toBeChecked()
    expect(onCheckedChange).toHaveBeenLastCalledWith(false, expect.anything())
  })

  it('starts checked with defaultChecked', async () => {
    const screen = await render(<Labelled defaultChecked />)

    await expect.element(screen.getByRole('checkbox')).toBeChecked()
  })

  it('toggles when its label text is clicked', async () => {
    const screen = await render(<Labelled />)

    await screen.getByText('Hide Mastered').click()

    await expect.element(screen.getByRole('checkbox')).toBeChecked()
  })

  it('toggles with Space once focused from the keyboard', async () => {
    const screen = await render(<Labelled />)
    const checkbox = screen.getByRole('checkbox', { name: 'Hide Mastered' })

    await userEvent.tab()
    await expect.element(checkbox).toHaveFocus()

    await userEvent.keyboard(' ')
    await expect.element(checkbox).toBeChecked()

    await userEvent.keyboard(' ')
    await expect.element(checkbox).not.toBeChecked()
  })

  it('follows the checked prop when controlled', async () => {
    const onCheckedChange = vi.fn()
    const screen = await render(
      <Labelled checked={false} onCheckedChange={onCheckedChange} />,
    )
    const checkbox = screen.getByRole('checkbox')

    await checkbox.click()

    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
    await expect.element(checkbox).not.toBeChecked()

    await screen.rerender(
      <Labelled checked onCheckedChange={onCheckedChange} />,
    )
    await expect.element(checkbox).toBeChecked()
  })

  it('works with state owned by the consumer', async () => {
    function HideMastered() {
      const [hide, setHide] = useState(false)
      return (
        <>
          <Labelled checked={hide} onCheckedChange={setHide} />
          <p>{hide ? 'hiding' : 'showing'}</p>
        </>
      )
    }
    const screen = await render(<HideMastered />)

    await screen.getByRole('checkbox').click()

    await expect.element(screen.getByRole('checkbox')).toBeChecked()
    await expect.element(screen.getByText('hiding')).toBeVisible()
  })

  it('is 16px with a 4px radius from the Figma tokens', async () => {
    const screen = await render(<Labelled />)

    const style = getComputedStyle(screen.getByRole('checkbox').element())
    expect(style.width).toBe('16px')
    expect(style.height).toBe('16px')
    expect(style.borderTopLeftRadius).toBe('4px')
  })
})
