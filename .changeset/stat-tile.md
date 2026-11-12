---
'@hp-flashcard/ui': minor
---

Adds **`StatTile`** (and its `StatTileProps` and `StatTileAccent` types), a Study Statistics tile. Pass a `label` (for example "Total Cards"), a `value` shown large under it, an `icon`, and an `accent` of `"blue-400"`, `"teal-400"`, `"pink-500"` or `"pink-400"` for the icon panel. The panel keeps its color and draws the icon in neutral-900 in both themes; the icon is decorative and sized to 32px. The tile is a `group` named by its label, a long label wraps, and props such as `className` go on the tile. New color roles back the panel and stay the same under `.dark`: `stat-blue`, `stat-teal`, `stat-pink`, `stat-pink-light` and `stat-foreground` (`bg-stat-teal`, `text-stat-foreground`, …).
