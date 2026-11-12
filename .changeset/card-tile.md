---
'@hp-flashcard/ui': minor
---

Adds **`CardTile`** (and its `CardTileProps` type), a card in the All Cards grid. Pass `question`, `answer`, `category` and `progress` (0–5, clamped). The tile shows the question, an "Answer:" label with the answer, and a footer with the category Badge, then either the progress bar with its "n/5" count or, at 5/5, the teal "Mastered 5/5" badge. Long questions and answers wrap; a long category is cut short with an ellipsis. A "Card actions" kebab menu offers Edit and Delete, which call `onEdit` and `onDelete`; the tile does nothing else with them. The tile is an `<article>` named by its question, and props such as `className` go on it.
