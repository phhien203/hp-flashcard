# @hp-flashcard/ui

The hp-flashcard design system: React 19 components built on [Base UI](https://base-ui.com) and Tailwind CSS v4.

```sh
pnpm add @hp-flashcard/ui
```

`react` and `react-dom` 19 are peer dependencies.

## Styles

Pick **one** of the two stylesheets. Don't import both: `styles.css` already contains everything in `theme.css`.

### `theme.css`: your app uses Tailwind CSS v4

Import the design tokens into your Tailwind entry CSS, after Tailwind itself:

```css
@import 'tailwindcss';
@import '@hp-flashcard/ui/theme.css';
```

Your Tailwind build then generates the utilities the components need, with no duplicates, and your own markup can use the same tokens (`p-100`, `rounded-8`, `bg-primary`, `text-preset-3`, …). `theme.css` finds the components' classes itself: you don't need an `@source` for `node_modules/@hp-flashcard/ui`.

`theme.css` replaces some of Tailwind's defaults. Its spacing, radius, container, color and shadow scales are the design's, so `p-2`, `rounded-lg`, `max-w-md`, `bg-red-500` and `shadow-md` no longer generate CSS. Use the token names instead.

### `styles.css`: your app doesn't use Tailwind

Import the precompiled stylesheet once, at your app's entry:

```ts
import '@hp-flashcard/ui/styles.css'
```

It contains the tokens, every utility the components use, the text presets, and Tailwind's preflight (base reset). Your own markup can use the classes it contains, but no others: there is no Tailwind build to generate them.

## Font

Components are set in **Poppins**, and both stylesheets load it for you. Each one imports `@hp-flashcard/ui/fonts.css`, which declares the `@font-face` rules for weights 400, 500, 600 and 700, self-hosted through [`@fontsource/poppins`](https://fontsource.org/fonts/poppins). That package is a dependency of `@hp-flashcard/ui`, so it installs with it. No Google Fonts link or extra setup is needed.

- With `styles.css`, the font files ship inside the package, next to the stylesheet.
- With `theme.css`, your bundler resolves the font files from `@fontsource/poppins`.

`@hp-flashcard/ui/fonts.css` is also exported on its own, for a page that needs Poppins without the rest.

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

## Dark mode

Add the `dark` class to an ancestor of the components, usually the root element: `<html class="dark">`. Every semantic color role (`background`, `foreground`, `card`, `primary`, `border`, `ring`, …) and the hard shadows switch to their dark values inside it. The `dark:` variant follows the same class, not `prefers-color-scheme`, so you decide when to switch: from a toggle, a saved setting or the media query, for example:

```ts
const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
document.documentElement.classList.toggle('dark', dark)
```

`.dark` also works on a nested element, to show one part of a page in the dark theme. In your own markup, use the roles (`bg-card`, `text-foreground`) rather than the primitives (`bg-neutral-0`), so it follows the theme too.

## Lint your own classes (optional)

This package bans arbitrary Tailwind values such as `p-[13px]` or `bg-(--x)` in its components, so every size and color comes from a design token. Apps on `theme.css` can apply the same rule with [`eslint-plugin-better-tailwindcss`](https://github.com/schoero/eslint-plugin-better-tailwindcss). Point `entryPoint` at your Tailwind entry CSS (the file that imports `theme.css`):

```js
// eslint.config.js
import betterTailwindcss from 'eslint-plugin-better-tailwindcss'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [betterTailwindcss.configs['correctness-error']],
    settings: {
      'better-tailwindcss': { entryPoint: 'src/index.css' },
    },
    rules: {
      // `dark` is the theme switch, not a utility.
      'better-tailwindcss/no-unknown-classes': [
        'error',
        { ignore: ['^dark$'] },
      ],
      'better-tailwindcss/no-restricted-classes': [
        'error',
        {
          restrict: [
            {
              // The utility (after any variants) ends in an arbitrary value:
              // p-[13px], bg-(--x), [mask-type:alpha], bg-red/[0.5].
              // Arbitrary variants such as [&_svg]: are still allowed.
              pattern: String.raw`^.*[\])](?:\/[\w.%-]+)?!?$`,
              message:
                'Arbitrary value in "$0": use a design token from @hp-flashcard/ui/theme.css.',
            },
          ],
        },
      ],
    },
  },
])
```

`correctness-error` also reports classes your Tailwind build doesn't know, such as `p-2` once `theme.css` has cleared the spacing scale.
