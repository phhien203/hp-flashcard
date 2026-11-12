import { page, userEvent } from 'vitest/browser'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'

// Import from the public barrel so a missing export fails the test.
import {
  Button,
  ToastProvider,
  useToast,
  type ToastOptions,
  type ToastProviderProps,
} from '../../index.js'

function AddButton(options: Partial<ToastOptions>) {
  const toast = useToast()
  return (
    <Button
      onClick={() =>
        toast.add({ title: 'Card created successfully.', ...options })
      }
    >
      Create card
    </Button>
  )
}

function App({
  provider,
  ...options
}: Partial<ToastOptions> & { provider?: ToastProviderProps }) {
  return (
    <ToastProvider {...provider}>
      <AddButton {...options} />
    </ToastProvider>
  )
}

// Toasts render in a portal on document.body, outside the render container,
// so they are queried from the whole page.
const toast = (name = 'Card created successfully.') =>
  page.getByRole('dialog', { name })

describe('Toast', () => {
  it('shows nothing until a toast is added', async () => {
    const screen = await render(<App />)

    await expect.element(screen.getByRole('button')).toBeVisible()
    expect(page.getByRole('dialog').query()).toBeNull()
  })

  it('shows a toast named by its title when add() is called', async () => {
    const screen = await render(<App />)

    await screen.getByRole('button', { name: 'Create card' }).click()

    await expect.element(toast()).toBeVisible()
    await expect
      .element(toast())
      .toHaveTextContent('Card created successfully.')
  })

  it('is announced politely from a live region', async () => {
    const screen = await render(<App />)

    await screen.getByRole('button', { name: 'Create card' }).click()

    const region = page.getByRole('region', { name: 'Notifications' })
    await expect.element(region).toHaveAttribute('aria-live', 'polite')
    expect(region.element().contains(toast().element())).toBe(true)
  })

  it('is announced as an alert with priority high', async () => {
    const screen = await render(<App priority="high" title="Card deleted." />)

    await screen.getByRole('button', { name: 'Create card' }).click()

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Card deleted.')
  })

  it('closes with its close button, which has an accessible name', async () => {
    const onClose = vi.fn()
    const screen = await render(<App onClose={onClose} />)
    await screen.getByRole('button', { name: 'Create card' }).click()

    await toast().getByRole('button', { name: 'Close' }).click()

    await expect.poll(() => toast().query()).toBeNull()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes with Escape once focused', async () => {
    const screen = await render(<App timeout={0} />)
    await screen.getByRole('button', { name: 'Create card' }).click()
    await expect.element(toast()).toBeVisible()

    // F6 jumps to the notifications region; Tab reaches the toast.
    await userEvent.keyboard('{F6}')
    await userEvent.tab()
    await expect.element(toast()).toHaveFocus()
    await userEvent.keyboard('{Escape}')

    await expect.poll(() => toast().query()).toBeNull()
  })

  it('closes on its own after its timeout', async () => {
    const onClose = vi.fn()
    const screen = await render(<App timeout={200} onClose={onClose} />)

    await screen.getByRole('button', { name: 'Create card' }).click()
    await expect.element(toast()).toBeVisible()

    await expect.poll(() => toast().query(), { timeout: 3000 }).toBeNull()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("closes after the provider's default timeout", async () => {
    const screen = await render(<App provider={{ timeout: 200 }} />)

    await screen.getByRole('button', { name: 'Create card' }).click()
    await expect.element(toast()).toBeVisible()

    await expect.poll(() => toast().query(), { timeout: 3000 }).toBeNull()
  })

  it('stays open with a timeout of 0 until close() is called', async () => {
    function Controls() {
      const { add, close } = useToast()
      return (
        <>
          <Button
            onClick={() => add({ id: 'saved', title: 'Saved.', timeout: 0 })}
          >
            Add
          </Button>
          <Button onClick={() => close('saved')}>Dismiss</Button>
        </>
      )
    }
    const screen = await render(
      <ToastProvider>
        <Controls />
      </ToastProvider>,
    )

    await screen.getByRole('button', { name: 'Add' }).click()
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect.element(toast('Saved.')).toBeVisible()

    await screen.getByRole('button', { name: 'Dismiss' }).click()
    await expect.poll(() => toast('Saved.').query()).toBeNull()
  })

  it('stacks several toasts', async () => {
    function Two() {
      const { add } = useToast()
      return (
        <Button
          onClick={() => {
            add({ title: 'Card created successfully.' })
            add({ title: 'Card updated successfully.' })
          }}
        >
          Add two
        </Button>
      )
    }
    const screen = await render(
      <ToastProvider>
        <Two />
      </ToastProvider>,
    )

    await screen.getByRole('button', { name: 'Add two' }).click()

    await expect.element(toast()).toBeVisible()
    await expect.element(toast('Card updated successfully.')).toBeVisible()
  })

  it('is a pill with the hard shadow, centred at the bottom', async () => {
    const screen = await render(<App timeout={0} />)
    await screen.getByRole('button', { name: 'Create card' }).click()
    const element = toast().element()
    await expect.element(toast()).toBeVisible()
    await Promise.all(element.getAnimations().map(({ finished }) => finished))

    const style = getComputedStyle(element)
    expect(style.borderTopLeftRadius).toBe('999px')
    expect(style.boxShadow).toMatch(/2px 2px 0px 0px/)

    const box = element.getBoundingClientRect()
    const centre = box.left + box.width / 2
    expect(Math.abs(centre - window.innerWidth / 2)).toBeLessThanOrEqual(1)
    expect(window.innerHeight - box.bottom).toBe(24)
  })

  it('throws when useToast is used outside a ToastProvider', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(render(<AddButton />)).rejects.toThrow(/Toast.Provider/)
    error.mockRestore()
  })
})
