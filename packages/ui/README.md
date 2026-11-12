# @hp-flashcard/ui

The hp-flashcard design system: React 19 components built on [Base UI](https://base-ui.com) and Tailwind CSS v4.

```sh
pnpm add @hp-flashcard/ui
```

`react` and `react-dom` 19 are peer dependencies.

## Styles

Pick **one** of these:

**Your app uses Tailwind CSS v4.** Import the design tokens into your Tailwind entry CSS. Your Tailwind build then generates the utilities the components need, with no duplicates:

```css
@import 'tailwindcss';
@import '@hp-flashcard/ui/theme.css';
```

**Your app doesn't use Tailwind.** Import the precompiled stylesheet once:

```ts
import '@hp-flashcard/ui/styles.css'
```

`styles.css` includes Tailwind's preflight (base reset).

Both entries load the **Poppins** font (weights 400, 500, 600 and 700, self-hosted through [`@fontsource/poppins`](https://fontsource.org/fonts/poppins)), so components render in Poppins with no extra setup. The `@font-face` rules on their own are also available as `@hp-flashcard/ui/fonts.css`.

## Typography

Each text preset from the design is a single utility that sets font size, line height, weight and letter spacing together:

| Utility                  | Weight   | Size                                 | Line height | Letter spacing |
| ------------------------ | -------- | ------------------------------------ | ----------- | -------------- |
| `text-preset-1`          | Bold     | 24px, 32px from `md`, 40px from `lg` | 120%        | 0              |
| `text-preset-2`          | SemiBold | 24px                                 | 120%        | 0              |
| `text-preset-3`          | SemiBold | 20px                                 | 120%        | 0              |
| `text-preset-4-semibold` | SemiBold | 16px                                 | 120%        | 0              |
| `text-preset-4-medium`   | Medium   | 16px                                 | 120%        | 0              |
| `text-preset-4-regular`  | Regular  | 16px                                 | 140%        | 0              |
| `text-preset-5-medium`   | Medium   | 14px                                 | 140%        | 0              |
| `text-preset-5-regular`  | Regular  | 14px                                 | 140%        | 0              |
| `text-preset-6`          | Medium   | 12px                                 | 130%        | -3%            |

## Usage

```tsx
import { Button } from '@hp-flashcard/ui'

export function Example() {
  return <Button variant="outline">Flip card</Button>
}
```

Dark mode: add the `dark` class to an ancestor element (for example `<html class="dark">`).
