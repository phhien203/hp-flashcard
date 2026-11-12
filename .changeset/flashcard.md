---
'@hp-flashcard/ui': minor
---

Adds **`Flashcard`** (and its `FlashcardProps` type), the Study Mode card. Pass `question`, `answer`, `category` and `progress` (0–5, clamped). The pink question side shows "Click to reveal answer". The blue answer side shows an "Answer:" label. Both sides show the category Badge and the progress bar with its "n/5" count. A plain button covers the whole card. It is named "Show answer" or "Show question" for what it does next, and click, Enter or Space flips the card with a 400ms 3D turn. Under `prefers-reduced-motion` the flip is instant. The answer isn't rendered until the card is flipped. To let the card manage its own state, leave `flipped` out (optionally set `defaultFlipped`). To control it, pass `flipped` and update it from `onFlippedChange`. Props such as `className` go on the card's root `<div>`.

The theme adds four color roles for the card, the same in light and dark: `flashcard-question` (pink-400), `flashcard-answer` (blue-400), `flashcard-foreground` (neutral-900) and `flashcard-sparkle` (yellow-500).
