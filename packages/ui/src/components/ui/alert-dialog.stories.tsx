import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'

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
} from './alert-dialog.js'
import { Button } from './button.js'

const onConfirm = fn()
const onCancel = fn()

/** Figma's "Delete card" confirmation (node 403:860). */
const meta = {
  title: 'Components/AlertDialog',
  component: AlertDialog,
  tags: ['autodocs'],
  args: {
    onOpenChange: fn(),
  },
  beforeEach: () => {
    onConfirm.mockClear()
    onCancel.mockClear()
  },
  render: (args) => (
    <AlertDialog {...args}>
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
  ),
} satisfies Meta<typeof AlertDialog>

export default meta
type Story = StoryObj<typeof meta>

const findDialog = () =>
  screen.findByRole('alertdialog', { name: 'Delete this card?' })

/** The open "Delete this card?" confirmation. */
export const DeleteCard: Story = {
  args: { defaultOpen: true },
  play: async () => {
    const dialog = await findDialog()
    await expect(dialog).toHaveAccessibleDescription(
      'This action cannot be undone.',
    )
    await expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument()
  },
}

/** Confirming runs the action and closes the dialog. */
export const Confirm: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Delete' }))
    const dialog = await findDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Delete Card' }))

    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    await expect(onConfirm).toHaveBeenCalledOnce()
  },
}

/** Cancelling closes the dialog without confirming. */
export const Cancel: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Delete' })
    await userEvent.click(trigger)
    const dialog = await findDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    await expect(onCancel).toHaveBeenCalledOnce()
    await expect(onConfirm).not.toHaveBeenCalled()
    await waitFor(() => expect(trigger).toHaveFocus())
  },
}

/** A click outside does not dismiss it: the user has to choose. */
export const OutsideClickStaysOpen: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Delete' }))
    const dialog = await findDialog()

    const backdrop = document.querySelector<HTMLElement>(
      '[data-slot="alert-dialog-overlay"]',
    )!
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: backdrop,
      coords: { clientX: 4, clientY: 4 },
    })

    await expect(dialog).toBeVisible()
    await expect(args.onOpenChange).toHaveBeenCalledTimes(1)
  },
}

/** Escape cancels and returns focus to the trigger. */
export const EscapeCancels: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Delete' })
    await userEvent.click(trigger)
    const dialog = await findDialog()

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    await expect(onConfirm).not.toHaveBeenCalled()
    await waitFor(() => expect(trigger).toHaveFocus())
  },
}
