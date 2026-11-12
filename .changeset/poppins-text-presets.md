---
'@hp-flashcard/ui': minor
---

Components now render in **Poppins** (400, 500, 600, 700) with no extra setup: both `@hp-flashcard/ui/styles.css` and `@hp-flashcard/ui/theme.css` load it, and `@hp-flashcard/ui/fonts.css` exports the `@font-face` rules on their own. `@fontsource/poppins` is a new dependency, and the precompiled `styles.css` ships the font files it references.

Adds one utility per design text preset, each setting size, line height, weight and letter spacing together: `text-preset-1` (24px, then 32px from `md` and 40px from `lg`), `text-preset-2`, `text-preset-3`, `text-preset-4-semibold`, `text-preset-4-medium`, `text-preset-4-regular`, `text-preset-5-medium`, `text-preset-5-regular` and `text-preset-6`. All of them are included in the precompiled `styles.css`.
