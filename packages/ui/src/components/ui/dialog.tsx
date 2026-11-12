import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/utils.js'
import { IconClose } from '../icons/icon-close.js'
import {
  dialogBackdropClassName,
  dialogDescriptionClassName,
  dialogPopupClassName,
  dialogTitleClassName,
} from './dialog-surface.js'

type DialogProps = DialogPrimitive.Root.Props

/**
 * A modal window, such as the "Edit your card" form. While it is open,
 * focus is trapped inside it; Escape, a click outside or the close ✕ closes
 * it, and focus returns to the trigger. Use `open` with `onOpenChange` to
 * control it, or `defaultOpen` to leave the state to the component.
 */
function Dialog(props: DialogProps) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

type DialogTriggerProps = DialogPrimitive.Trigger.Props

/** Opens the dialog. Pass `render={<Button />}` to style it as a button. */
function DialogTrigger(props: DialogTriggerProps) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

type DialogCloseProps = DialogPrimitive.Close.Props

/** Closes the dialog, e.g. `render={<Button variant="secondary" />}`. */
function DialogClose(props: DialogCloseProps) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

type DialogContentProps = DialogPrimitive.Popup.Props & {
  /** Show the close ✕ in the top-right corner. Defaults to `true`. */
  showCloseButton?: boolean
  /** Accessible name of the close ✕. Defaults to `"Close"`. */
  closeLabel?: string
}

/**
 * The dialog window, rendered in a portal over a backdrop. Its width is
 * capped by the `container-dialog` token. Put a `DialogTitle` first: it
 * names the dialog.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeLabel = 'Close',
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogPrimitive.Backdrop
        data-slot="dialog-overlay"
        className={dialogBackdropClassName()}
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={dialogPopupClassName(className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label={closeLabel}
            className="absolute top-200 right-200 flex size-400 cursor-pointer items-center justify-center rounded-full text-card-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconClose />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

type DialogHeaderProps = ComponentProps<'div'>

/** Groups the title and description. Leaves room for the close ✕. */
function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-100 pr-400', className)}
      {...props}
    />
  )
}

type DialogFooterProps = ComponentProps<'div'>

/** The actions row, aligned to the end. */
function DialogFooter({ className, ...props }: DialogFooterProps) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-wrap justify-end gap-200', className)}
      {...props}
    />
  )
}

type DialogTitleProps = DialogPrimitive.Title.Props

/** The dialog's heading. It names the dialog. */
function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={dialogTitleClassName(className)}
      {...props}
    />
  )
}

type DialogDescriptionProps = DialogPrimitive.Description.Props

/** Supporting text. It becomes the dialog's accessible description. */
function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={dialogDescriptionClassName(className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  type DialogCloseProps,
  type DialogContentProps,
  type DialogDescriptionProps,
  type DialogFooterProps,
  type DialogHeaderProps,
  type DialogProps,
  type DialogTitleProps,
  type DialogTriggerProps,
}
