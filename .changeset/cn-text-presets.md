---
'@hp-flashcard/ui': patch
---

`cn` now recognises the `text-preset-*` typography utilities as font sizes. Before, it read them as text colors, so `cn('text-preset-4-semibold', 'text-foreground')` dropped the preset. Presets now survive alongside a text color, and a later preset replaces an earlier one.
