import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import type { ReactNode } from 'react'

import { cn } from '../../lib/utils.js'
import { IconCheck } from '../icons/icon-check.js'

type MenuProps = MenuPrimitive.Root.Props

/**
 * A dropdown menu: a `MenuTrigger` and a `MenuContent` holding `MenuItem`s
 * or `MenuCheckboxItem`s. Opens on click, Enter, Space or the arrow keys;
 * arrows move between items; Escape closes it and returns focus to the
 * trigger.
 */
function Menu(props: MenuProps) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />
}

type MenuTriggerProps = MenuPrimitive.Trigger.Props

/**
 * Opens the menu. Pass `render` to use another component as the trigger,
 * such as an icon-only `Button`:
 * `<MenuTrigger render={<Button size="icon" aria-label="Actions"><Icon /></Button>} />`.
 */
function MenuTrigger(props: MenuTriggerProps) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />
}

type MenuContentProps = MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset'
  >

/** The popup, portalled to the body and positioned against the trigger. */
function MenuContent({
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 8,
  className,
  ...props
}: MenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            'flex min-w-1600 flex-col overflow-y-auto rounded-8 border border-border bg-popover py-50 text-popover-foreground shadow-rest outline-none',
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

// Shared by both item kinds. The highlighted item (pointer or arrow keys)
// takes the page background, which stands out from the popover in both
// themes; keyboard focus adds the ring.
const itemClasses =
  'flex cursor-pointer items-center gap-100 px-200 py-100 text-preset-5-medium whitespace-nowrap outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-disabled:cursor-not-allowed data-disabled:opacity-50 data-highlighted:bg-background'

type MenuItemProps = MenuPrimitive.Item.Props & {
  /** Icon rendered before the label. Icons are decorative. */
  icon?: ReactNode
}

/** An action. Selecting it calls `onClick` and closes the menu. */
function MenuItem({ className, icon, children, ...props }: MenuItemProps) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(itemClasses, className)}
      {...props}
    >
      {icon}
      {children}
    </MenuPrimitive.Item>
  )
}

type MenuCheckboxItemProps = MenuPrimitive.CheckboxItem.Props

/**
 * A toggle drawn as a `Checkbox`. Selecting it keeps the menu open. Pass
 * `checked` and `onCheckedChange` to control it, or `defaultChecked`.
 */
function MenuCheckboxItem({
  className,
  children,
  ...props
}: MenuCheckboxItemProps) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="menu-checkbox-item"
      className={cn('group/menu-checkbox-item', itemClasses, className)}
      {...props}
    >
      {/* The Checkbox look: card box, input border, primary fill when checked. */}
      <span
        aria-hidden
        className="flex size-200 shrink-0 items-center justify-center rounded-4 border border-input bg-card text-primary-foreground group-data-checked/menu-checkbox-item:bg-primary"
      >
        <MenuPrimitive.CheckboxItemIndicator className="flex">
          <IconCheck className="size-150" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

export {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuTrigger,
  type MenuCheckboxItemProps,
  type MenuContentProps,
  type MenuItemProps,
  type MenuProps,
  type MenuTriggerProps,
}
