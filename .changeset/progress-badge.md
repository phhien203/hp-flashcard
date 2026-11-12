---
'@hp-flashcard/ui': minor
---

Adds **`Progress`** and **`Badge`** (with their `ProgressProps` and `BadgeProps` types).

- **`Progress`** shows a card's mastery as a pill-shaped bar. It takes a `value` from 0 to `max` (5 by default) and clamps values outside that range (a non-finite value counts as 0). Screen readers announce it as a progress bar with its value, its max and "n of max". Set `showCount` to show the "n/5" count beside the bar. It has no visible label, so it needs an `aria-label` or an `aria-labelledby`, and `ProgressProps` enforces that.
- **`Badge`** is a small text pill. `variant="outline"` (the default) is the category tag, on the card surface with a border. `variant="mastered"` is the "Mastered" pill: teal-400 with neutral-900 text in both themes, from the new `mastered` and `mastered-foreground` color roles (`bg-mastered`, `text-mastered-foreground`, …), which `.dark` leaves unchanged. Its `icon` prop puts a decorative icon before the text.
