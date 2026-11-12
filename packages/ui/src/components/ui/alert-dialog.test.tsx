import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

// Import from the public barrel so a missing export fails the test.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '../../index.js'

const DeleteCard = ({
  onConfirm,
  onCancel,
}: {
  onConfirm?: () => void
  onCancel?: () => void
}) => (
  <AlertDialog>
    <AlertDialogTrigger render={<Button variant="secondary" />}>
      Delete
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete this card?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>Delete Card</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

const openDialog = async () => {
  await page.getByRole('button', { name: 'Delete' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Delete this card?' })
  await expect.element(dialog).toBeVisible()
  return dialog
}

describe('AlertDialog', () => {
  it('opens a alert dialog named and described by its text', async () => {
    await render(<DeleteCard />)

    const dialog = await openDialog()

    await expect
      .element(dialog)
      .toHaveAccessibleDescription('This action cannot be undone.')
  })

  it('has no close ✕: only cancel and confirm', async () => {
    await render(<DeleteCard />)
    const dialog = await openDialog()

    expect(
      dialog
        .getByRole('button')
        .elements()
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Delete Card'])
  })

  it('stays open on a click outside', async () => {
    await render(<DeleteCard />)
    const dialog = await openDialog()

    await page
      .elementLocator(
        document.querySelector('[data-slot="alert-dialog-overlay"]')!,
      )
      .click({ position: { x: 4, y: 4 }, force: true })

    await expect.element(dialog).toBeVisible()
  })

  it('calls onClick and closes when confirmed', async () => {
    const onConfirm = vi.fn()
    await render(<DeleteCard onConfirm={onConfirm} />)
    const dialog = await openDialog()

    await dialog.getByRole('button', { name: 'Delete Card' }).click()

    expect(onConfirm).toHaveBeenCalledOnce()
    await expect.element(dialog).not.toBeInTheDocument()
  })

  it('closes without confirming when cancelled', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await render(<DeleteCard onConfirm={onConfirm} onCancel={onCancel} />)
    const dialog = await openDialog()

    await dialog.getByRole('button', { name: 'Cancel' }).click()

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
    await expect.element(dialog).not.toBeInTheDocument()
  })

  it('traps focus, closes on Escape and returns focus to the trigger', async () => {
    const onConfirm = vi.fn()
    await render(<DeleteCard onConfirm={onConfirm} />)
    const dialog = await openDialog()

    for (let i = 0; i < 3; i++) {
      await userEvent.tab()
      // Base UI's focus guards move focus back a moment after the Tab.
      await expect
        .poll(() => dialog.element().contains(document.activeElement))
        .toBe(true)
    }
    await userEvent.keyboard('{Escape}')

    await expect.element(dialog).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    await expect
      .element(page.getByRole('button', { name: 'Delete' }))
      .toHaveFocus()
  })

  it('confirms from the keyboard', async () => {
    const onConfirm = vi.fn()
    await render(<DeleteCard onConfirm={onConfirm} />)
    const dialog = await openDialog()
    const confirm = dialog.getByRole('button', { name: 'Delete Card' })

    // Wherever focus starts, it cycles to the confirm button within the dialog.
    for (
      let i = 0;
      i < 3 && document.activeElement !== confirm.element();
      i++
    ) {
      await userEvent.tab()
    }
    await expect.element(confirm).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    expect(onConfirm).toHaveBeenCalledOnce()
    await expect.element(dialog).not.toBeInTheDocument()
  })
})
