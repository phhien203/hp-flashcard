---
'@hp-flashcard/ui': minor
---

Adds **`CategoryFilter`** (and its `CategoryFilterProps` and `CategoryFilterCategory` types), the "All Categories" dropdown. Pass `categories` as `{ name, count }` objects; each is listed as a checkbox item reading "Biology (12)", the count in `muted-foreground`. The trigger is an outline `Button` with an angle-down icon. Ticking items keeps the menu open, so several can be picked in one go. Control the ticked names with `value` and `onValueChange(names)`, or start them with `defaultValue`; a ticked name is added to the end of the list and an unticked one removed. `className` goes on the trigger. It opens and is used from the keyboard like `Menu`.
