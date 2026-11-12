import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/utils.js'
import { Button, type ButtonProps } from './button.js'
import {
  dialogBackdropClassName,
  dialogDescriptionClassName,
  dialogPopupClassName,
  dialogTitleClassName,
} from './dialog-surface.js'

type AlertDialogProps = AlertDialogPrimitive.Root.Props

/**
 * A confirmation that interrupts the user, such as "Delete this card?".
 * Unlike `Dialog`, a click outside does not close it: the user has to pick
 * `AlertDialogAction` or `AlertDialogCancel` (or press Escape, which
 * cancels). Focus is trapped while it is open and returns to the trigger.
 */
function AlertDialog(props: AlertDialogProps) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

type AlertDialogTriggerProps = AlertDialogPrimitive.Trigger.Props

/** Opens the alert dialog. Pass `render={<Button />}` to style it. */
function AlertDialogTrigger(props: AlertDialogTriggerProps) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

type AlertDialogContentProps = AlertDialogPrimitive.Popup.Props

/**
 * The alert dialog window, rendered in a portal over a backdrop, with the
 * same surface and `container-dialog` width as `DialogContent` and no
 * close ✕. Put an `AlertDialogTitle` first: it names the dialog.
 */
function AlertDialogContent({ className, ...props }: AlertDialogContentProps) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal">
      <AlertDialogPrimitive.Backdrop
        data-slot="alert-dialog-overlay"
        className={dialogBackdropClassName()}
      />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={dialogPopupClassName(className)}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  )
}

type AlertDialogHeaderProps = ComponentProps<'div'>

/** Groups the title and description. */
function AlertDialogHeader({ className, ...props }: AlertDialogHeaderProps) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn('flex flex-col gap-100', className)}
      {...props}
    />
  )
}

type AlertDialogFooterProps = ComponentProps<'div'>

/**
 * The actions row: cancel, then confirm, aligned to the end below a
 * divider that runs the full width of the window.
 */
function AlertDialogFooter({ className, ...props }: AlertDialogFooterProps) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        '-mx-300 -mb-300 flex flex-wrap justify-end gap-200 border-t border-border px-300 py-200',
        className,
      )}
      {...props}
    />
  )
}

type AlertDialogTitleProps = AlertDialogPrimitive.Title.Props

/** The question being confirmed. It names the dialog. */
function AlertDialogTitle({ className, ...props }: AlertDialogTitleProps) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={dialogTitleClassName(className)}
      {...props}
    />
  )
}

type AlertDialogDescriptionProps = AlertDialogPrimitive.Description.Props

/** The consequence. It becomes the dialog's accessible description. */
function AlertDialogDescription({
  className,
  ...props
}: AlertDialogDescriptionProps) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={dialogDescriptionClassName(className)}
      {...props}
    />
  )
}

type AlertDialogButtonProps = Omit<
  AlertDialogPrimitive.Close.Props,
  'render'
> & {
  variant?: ButtonProps['variant']
}

type AlertDialogActionProps = AlertDialogButtonProps

/**
 * Confirms: runs `onClick`, then closes the dialog. A `primary` Button by
 * default.
 */
function AlertDialogAction({
  variant = 'primary',
  ...props
}: AlertDialogActionProps) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-action"
      render={<Button variant={variant} />}
      {...props}
    />
  )
}

type AlertDialogCancelProps = AlertDialogButtonProps

/** Cancels and closes the dialog. A `secondary` Button by default. */
function AlertDialogCancel({
  variant = 'secondary',
  ...props
}: AlertDialogCancelProps) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      render={<Button variant={variant} />}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  type AlertDialogActionProps,
  type AlertDialogCancelProps,
  type AlertDialogContentProps,
  type AlertDialogDescriptionProps,
  type AlertDialogFooterProps,
  type AlertDialogHeaderProps,
  type AlertDialogProps,
  type AlertDialogTitleProps,
  type AlertDialogTriggerProps,
}
