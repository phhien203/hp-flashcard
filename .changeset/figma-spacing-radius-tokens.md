---
'@hp-flashcard/ui': minor
---

Spacing, radius and size utilities now use the Figma token names, and Tailwind's default scales are removed.

- **Spacing:** `spacing-0`, `25`, `50`, `75`, `100` … `1800`, where `100` = 8px (`p-100`, `gap-75`, `h-400`). `spacing-1800` is 140px, as in Figma. Tailwind's spacing multiplier is gone: `p-2`, `p-2.5` and `h-8` no longer generate CSS. `w-full`, `w-1/2`, `h-px` and other keyword or fraction sizes still work.
- **Radius:** `rounded-0`, `4`, `6`, `8`, `10`, `12`, `16`, `20`, `24` and `full` (999px). Tailwind's and shadcn's scales (`rounded-sm` … `rounded-4xl`, `rounded`) and the `--radius` variable are removed.
- **Named sizes:** `container-dialog` (600px) and `container-page` (1240px), used as `w-dialog`, `max-w-page`, etc. Tailwind's container scale (`max-w-md`, …) is removed.
- `cn` resolves conflicts between the new radius and size names, so `<Button className="rounded-4">` overrides the button's own radius.
- **Button** now sits on the scale: `xs` is 20px tall (was 24px), `sm` is 24px (was 28px), `default` stays 32px, and `lg` is 40px (was 36px). Icon-only sizes follow the same heights. In `sm`, the label is now `text-xs` (12px, was 12.8px) and its icons are 12px (were 14px).

If you build with `@hp-flashcard/ui/theme.css`, replace Tailwind spacing, radius and container classes in your own markup with the token names above.
