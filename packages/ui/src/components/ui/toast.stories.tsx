import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { expect, fn, screen, waitFor } from 'storybook/test'

import { Button } from './button.js'
import { ToastProvider, useToast } from './toast.js'

function CreateCard({ onClose }: { onClose?: () => void }) {
  const toast = useToast()
  return (
    <Button
      onClick={() =>
        toast.add({ title: 'Card created successfully.', onClose })
      }
    >
      Create card
    </Button>
  )
}

/** Shows a toast as soon as it mounts, so the toast can be seen at rest. */
function ShowOnMount() {
  const { add, close } = useToast()
  useEffect(() => {
    const id = add({ title: 'Card created successfully.', timeout: 0 })
    return () => close(id)
  }, [add, close])
  return null
}

const meta = {
  title: 'Components/Toast',
  component: ToastProvider,
  tags: ['autodocs'],
  args: { timeout: 5000 },
  argTypes: { children: { control: false } },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ToastProvider>

export default meta
type Story = StoryObj<typeof meta>

// Toasts render in a portal on document.body, outside the story canvas, so
// the play functions query the whole screen.
const findToast = () =>
  screen.findByRole('dialog', { name: 'Card created successfully.' })
const queryToast = () =>
  screen.queryByRole('dialog', { name: 'Card created successfully.' })

/** The toast as the design shows it: bottom-centre, until dismissed. */
export const Open: Story = {
  args: { timeout: 0 },
  render: (args) => (
    <ToastProvider {...args}>
      <ShowOnMount />
    </ToastProvider>
  ),
  play: async () => {
    const toast = await findToast()
    // It fades in from opacity 0.
    await waitFor(() => expect(toast).toBeVisible())
    await expect(
      screen.getByRole('button', { name: 'Close' }),
    ).toBeInTheDocument()
  },
}

/** Click the button to add a toast, then close it with ✕. */
export const AddAndClose: Story = {
  render: (args) => (
    <div className="p-300">
      <ToastProvider {...args}>
        <CreateCard onClose={onClose} />
      </ToastProvider>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    onClose.mockClear()
    await userEvent.click(canvas.getByRole('button', { name: 'Create card' }))
    const toast = await findToast()
    // It fades in from opacity 0.
    await waitFor(() => expect(toast).toBeVisible())

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(queryToast()).toBeNull())
    await expect(onClose).toHaveBeenCalledOnce()
  },
}
const onClose = fn()

/** A short timeout: the toast closes on its own. */
export const AutoDismiss: Story = {
  args: { timeout: 500 },
  render: AddAndClose.render,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Create card' }))
    await findToast()

    await waitFor(() => expect(queryToast()).toBeNull(), { timeout: 3000 })
  },
}

/** F6 moves to the notifications, Tab to the toast, Escape closes it. */
export const KeyboardDismiss: Story = {
  args: { timeout: 0 },
  render: AddAndClose.render,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Create card' }))
    const toast = await findToast()

    await userEvent.keyboard('{F6}')
    await userEvent.tab()
    await expect(toast).toHaveFocus()
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(queryToast()).toBeNull())
  },
}

function SaveHiddenCard({ onShow }: { onShow: () => void }) {
  const toast = useToast()
  return (
    <Button
      onClick={() =>
        toast.add({
          title: 'Card created. Your filters hide it.',
          timeout: 0,
          action: { label: 'Show card', onClick: onShow },
        })
      }
    >
      Create card
    </Button>
  )
}
const onShow = fn()

/** With an action: the button runs it and closes the toast. */
export const WithAction: Story = {
  args: { timeout: 0 },
  render: (args) => (
    <div className="p-300">
      <ToastProvider {...args}>
        <SaveHiddenCard onShow={onShow} />
      </ToastProvider>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    onShow.mockClear()
    await userEvent.click(canvas.getByRole('button', { name: 'Create card' }))
    const toast = await screen.findByRole('dialog', {
      name: 'Card created. Your filters hide it.',
    })
    await waitFor(() => expect(toast).toBeVisible())

    await userEvent.click(screen.getByRole('button', { name: 'Show card' }))

    await expect(onShow).toHaveBeenCalledOnce()
    await waitFor(() => expect(toast).not.toBeInTheDocument())
  },
}
