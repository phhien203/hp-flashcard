---
'@hp-flashcard/ui': minor
---

Adds **`Menu`**, a dropdown menu built on Base UI, with `MenuTrigger`, `MenuContent`, `MenuItem` and `MenuCheckboxItem` (and their `MenuProps`, `MenuTriggerProps`, `MenuContentProps`, `MenuItemProps` and `MenuCheckboxItemProps` types).

- `MenuTrigger` takes `render` to use another component as the trigger, such as an icon-only `Button`: `<MenuTrigger render={<Button size="icon" aria-label="Card actions"><Icon /></Button>} />`.
- `MenuContent` is a popover-colored panel with a border, an 8px radius and the `shadow-rest` hard shadow. It opens below the trigger by default; pass `side`, `align` and their offsets to place it.
- `MenuItem` is an action: `onClick` runs and the menu closes. Pass `icon` for a decorative leading icon.
- `MenuCheckboxItem` is drawn as a `Checkbox` and keeps the menu open when toggled. Control it with `checked` and `onCheckedChange(checked)`, or use `defaultChecked`.
- Keyboard: Enter, Space or the arrow keys open the menu, the arrows move between items, Enter or Space selects, and Escape closes it and returns focus to the trigger. Items take the page background when highlighted and show the `ring` on keyboard focus. `disabled` items are dimmed and skipped.
