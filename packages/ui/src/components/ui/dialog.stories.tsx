import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'

import { Button } from './button.js'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog.js'
import { Field, FieldLabel } from './field.js'
import { Input } from './input.js'
import { Textarea } from './textarea.js'

/** Figma's "Edit card" modal (node 400:957). */
const meta = {
  title: 'Components/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  args: {
    onOpenChange: fn(),
  },
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger render={<Button variant="secondary" />}>
        Edit card
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit your card</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel>Question</FieldLabel>
          <Input defaultValue="What does HTML stand for?" />
        </Field>
        <Field>
          <FieldLabel>Answer</FieldLabel>
          <Textarea defaultValue="HyperText Markup Language" />
        </Field>
        <Field>
          <FieldLabel>Category</FieldLabel>
          <Input defaultValue="Web Development" />
        </Field>
        <DialogFooter>
          <DialogClose render={<Button />}>Update Card</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

/** The open "Edit your card" form. */
export const EditCard: Story = {
  args: { defaultOpen: true },
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Edit your card',
    })
    await expect(dialog).toBeVisible()
    await expect(screen.getByRole('textbox', { name: 'Question' })).toHaveValue(
      'What does HTML stand for?',
    )
    await expect(
      screen.getByRole('button', { name: 'Close' }),
    ).toBeInTheDocument()
  },
}

/** Closed: the trigger opens the dialog and focus moves into it. */
export const Closed: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Edit card' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Edit your card',
    })
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement),
    )
    await expect(args.onOpenChange).toHaveBeenCalledWith(
      true,
      expect.anything(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
  },
}

/** Escape closes the dialog and focus returns to the trigger. */
export const EscapeCloses: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Edit card' })
    await userEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', {
      name: 'Edit your card',
    })

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  },
}

/** "Update Card" is a `DialogClose`: it closes the dialog. */
export const UpdateCloses: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Edit card' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Edit your card',
    })

    await userEvent.click(screen.getByRole('button', { name: 'Update Card' }))

    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.anything(),
    )
  },
}
