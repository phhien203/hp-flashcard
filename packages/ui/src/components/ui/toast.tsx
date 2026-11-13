import { Toast as ToastPrimitive } from '@base-ui/react/toast'
import { useMemo, type ReactNode } from 'react'

import { IconClose } from '../icons/icon-close.js'

interface ToastProviderProps {
  children?: ReactNode
  /**
   * How long, in milliseconds, a toast stays before it closes on its own.
   * `0` keeps toasts until they are dismissed. A toast's own `timeout`
   * overrides it.
   * @default 5000
   */
  timeout?: number
  /**
   * The most toasts shown at once. Older ones are hidden until newer ones
   * close.
   * @default 3
   */
  limit?: number
}

/** What `useToast().add()` takes. */
interface ToastOptions {
  /** The message, for example "Card created successfully." */
  title: ReactNode
  /** Reuse an id to update a toast in place instead of adding another. */
  id?: string
  /** Milliseconds before this toast closes on its own. `0` keeps it open. */
  timeout?: number
  /**
   * `low` (the default) is announced politely; `high` is announced at once
   * as an alert. Keep `high` for messages that can't wait.
   */
  priority?: 'low' | 'high'
  /** Called when the toast starts to close, by timeout or by the user. */
  onClose?: () => void
  /**
   * A button in the toast, such as "Show card". Clicking it runs `onClick`
   * and closes the toast. A toast with an action should not time out
   * before the user can reach it: consider `timeout: 0`.
   */
  action?: ToastAction
}

/** A toast's action button. */
interface ToastAction {
  /** The button's label. */
  label: ReactNode
  onClick: () => void
}

/**
 * Holds the toasts for everything inside it and shows them, bottom-centre,
 * over the page. Put it once near the root of the app; anything inside can
 * call `useToast()`.
 */
function ToastProvider({ children, timeout, limit }: ToastProviderProps) {
  return (
    <ToastPrimitive.Provider timeout={timeout} limit={limit}>
      {children}
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          data-slot="toast-viewport"
          className="fixed bottom-300 left-1/2 z-50 flex w-max max-w-full -translate-x-1/2 flex-col items-center gap-150 px-200 outline-none"
        >
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  )
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()
  return toasts.map((toast) => (
    <ToastPrimitive.Root
      key={toast.id}
      toast={toast}
      data-slot="toast"
      className="flex max-w-full items-center gap-150 rounded-full border border-border bg-card py-125 pr-125 pl-250 text-card-foreground shadow-rest transition outline-none focus-visible:border-ring focus-visible:shadow-ring data-ending-style:opacity-0 data-limited:hidden data-starting-style:translate-y-200 data-starting-style:opacity-0 motion-reduce:transition-none"
    >
      <ToastPrimitive.Title className="text-preset-4-medium" />
      <ToastPrimitive.Action
        data-slot="toast-action"
        className="shrink-0 cursor-pointer rounded-full px-100 py-50 text-preset-4-semibold underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-3 focus-visible:ring-ring"
      />
      <ToastPrimitive.Close
        // Base UI hides the button from assistive technology until the
        // stack expands, because its stacked toasts overlap. These toasts
        // never overlap, and a hidden but focusable button fails axe.
        aria-hidden={false}
        aria-label="Close"
        data-slot="toast-close"
        className="flex size-300 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        <IconClose />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  ))
}

/**
 * Shows toasts from anywhere inside a `ToastProvider`.
 *
 * `add({ title })` shows a toast and returns its id; with `action` it also
 * offers a button that runs `action.onClick` and closes the toast. `close(id)` closes it,
 * and `close()` closes them all. Both keep their identity across renders.
 */
function useToast() {
  const { add, close } = ToastPrimitive.useToastManager()
  return useMemo(
    () => ({
      add: ({ action, ...options }: ToastOptions): string => {
        const id = add({
          ...options,
          actionProps: action && {
            children: action.label,
            onClick: () => {
              action.onClick()
              close(id)
            },
          },
        })
        return id
      },
      close: (id?: string): void => close(id),
    }),
    [add, close],
  )
}

export {
  ToastProvider,
  useToast,
  type ToastAction,
  type ToastOptions,
  type ToastProviderProps,
}
