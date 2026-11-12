---
'@hp-flashcard/ui': minor
---

Colors and shadows now come from the Figma design system.

- **Palette:** the Figma primitives (`neutral-950/900/600/300/100/0`, `yellow-500`, `blue-400/600`, `teal-400`, `pink-400/500/700`) are the only colors. Tailwind's default palette is gone, so classes like `bg-red-500` no longer produce CSS. Use the primitives only for fixed accent decoration.
- **Semantic roles** keep shadcn's names (`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring` and their `-foreground` pairs) and point at the primitives. Adding `.dark` to any ancestor switches them to the dark theme.
- **Removed:** the `sidebar-*` and `chart-*` tokens, and Tailwind's default `shadow-*` scale.
- **Shadows:** `shadow-rest` and `shadow-hover` are hard offset shadows in `--shadow-color` (neutral-900, or neutral-100 in dark). Add `focus-visible:shadow-ring` and `focus-visible:border-ring` to switch them to the ring color on keyboard focus.
- **Button** now takes its colors from these roles. The `destructive` variant is pink text on the card surface, and `link` uses the foreground color, so both keep AA contrast.
