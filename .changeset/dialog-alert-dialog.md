---
'@hp-flashcard/ui': minor
---

Adds **`Dialog`** and **`AlertDialog`**, built on Base UI, with a `Props` type for every part.

- **`Dialog`** (`DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`) is a modal window for forms such as "Edit your card". `DialogContent` is a white (card) surface with a border, `rounded-16` and the `shadow-hover` hard shadow, at most `container-dialog` (600px) wide with a 16px gutter on small screens. It has a close ✕ in the top-right corner: rename it with `closeLabel` (default `"Close"`) or hide it with `showCloseButton={false}`. Escape, a click outside, the ✕ or a `DialogClose` closes it.
- **`AlertDialog`** (`AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogCancel`, `AlertDialogAction`) is a confirmation such as "Delete this card?". It has no close ✕ and a click outside does not close it: the user picks `AlertDialogCancel` (a `secondary` Button) or `AlertDialogAction` (a `primary` Button), or presses Escape to cancel. Both run their `onClick` and then close. The footer sits below a full-width divider. Pass `variant` to change either button's look.
- In both, focus moves into the window when it opens and stays there, then returns to the trigger on close. The title names the window and the description becomes its accessible description. Use `open` with `onOpenChange` to control them, or `defaultOpen`.
