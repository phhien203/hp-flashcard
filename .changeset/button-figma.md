---
'@hp-flashcard/ui': minor
---

**Breaking:** `Button` now follows the design's Button component set.

- **Variants:** `primary` (yellow, the default), `secondary` (white, dark surface in dark mode) and `outline` (border only, the surface shows through). The `default`, `ghost`, `destructive` and `link` variants are removed: use `primary` in place of `default`.
- **Sizes:** `default` (48px tall pill) and `icon` (48px circle). `xs`, `sm`, `lg`, `icon-xs`, `icon-sm` and `icon-lg` are removed.
- **States:** a hard `shadow-rest` at rest that grows to `shadow-hover` on hover, a `ring`-colored border and shadow on keyboard focus, and a faded disabled state that ignores clicks.
- **Icons:** new `leadingIcon` and `trailingIcon` props place an icon before or after the label. `size="icon"` takes the icon as `children` and requires `aria-label` or `aria-labelledby`, enforced by `ButtonProps`. In development, it also logs a `console.warn` if both are missing or blank (for example `aria-label=""`).
