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

## Usage

```tsx
import { Button } from '@hp-flashcard/ui'

export function Example() {
  return <Button variant="outline">Flip card</Button>
}
```

Dark mode: add the `dark` class to an ancestor element (for example `<html class="dark">`).
