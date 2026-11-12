import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

// Import from the public barrel so a missing export fails the test.
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldLabel,
  Input,
  type DialogContentProps,
} from '../../index.js'

const EditCard = ({
  onOpenChange,
  ...contentProps
}: Partial<DialogContentProps> & {
  onOpenChange?: (open: boolean) => void
}) => (
  <Dialog onOpenChange={onOpenChange}>
    <DialogTrigger render={<Button />}>Edit card</DialogTrigger>
    <DialogContent {...contentProps}>
      <DialogHeader>
        <DialogTitle>Edit your card</DialogTitle>
        <DialogDescription>Change the question or answer.</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel>Question</FieldLabel>
        <Input defaultValue="What is the capital of France?" />
      </Field>
      <DialogFooter>
        <DialogClose render={<Button />}>Update Card</DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)

const openDialog = async () => {
  await page.getByRole('button', { name: 'Edit card' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit your card' })
  await expect.element(dialog).toBeVisible()
  return dialog
}

/** A point on the backdrop, outside the centred popup. */
const clickOutside = () =>
  page
    .elementLocator(document.querySelector('[data-slot="dialog-overlay"]')!)
    .click({ position: { x: 4, y: 4 } })

describe('Dialog', () => {
  it('opens a dialog named by its title and described by its description', async () => {
    await render(<EditCard />)

    const dialog = await openDialog()

    await expect
      .element(dialog)
      .toHaveAccessibleDescription('Change the question or answer.')
  })

  it('moves focus into the dialog and traps it there', async () => {
    await render(<EditCard />)
    const dialog = await openDialog()

    await expect.element(dialog.getByRole('textbox')).toHaveFocus()
    for (let i = 0; i < 4; i++) {
      await userEvent.tab()
      // Base UI's focus guards move focus back a moment after the Tab.
      await expect
        .poll(() => dialog.element().contains(document.activeElement))
        .toBe(true)
    }
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const onOpenChange = vi.fn()
    await render(<EditCard onOpenChange={onOpenChange} />)
    const dialog = await openDialog()

    await userEvent.keyboard('{Escape}')

    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .element(page.getByRole('button', { name: 'Edit card' }))
      .toHaveFocus()
    expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.anything())
  })

  it('closes from the close ✕ button', async () => {
    await render(<EditCard />)
    const dialog = await openDialog()

    await dialog.getByRole('button', { name: 'Close' }).click()

    await expect.element(dialog).not.toBeInTheDocument()
  })

  it('names the close ✕ with closeLabel', async () => {
    await render(<EditCard closeLabel="Close edit form" />)
    const dialog = await openDialog()

    await expect
      .element(dialog.getByRole('button', { name: 'Close edit form' }))
      .toBeVisible()
  })

  it('hides the close ✕ with showCloseButton={false}', async () => {
    await render(<EditCard showCloseButton={false} />)
    const dialog = await openDialog()

    await expect
      .element(dialog.getByRole('button', { name: 'Close' }))
      .not.toBeInTheDocument()
  })

  it('closes on a click outside', async () => {
    await render(<EditCard />)
    const dialog = await openDialog()

    await clickOutside()

    await expect.element(dialog).not.toBeInTheDocument()
  })

  it('closes from a DialogClose action', async () => {
    await render(<EditCard />)
    const dialog = await openDialog()

    await dialog.getByRole('button', { name: 'Update Card' }).click()

    await expect.element(dialog).not.toBeInTheDocument()
  })

  it('takes its maximum width from the container-dialog token', async () => {
    await render(<EditCard />)
    const dialog = await openDialog()

    expect(getComputedStyle(dialog.element()).maxWidth).toBe('600px')
  })
})
