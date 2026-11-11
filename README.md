# hp-flashcard

[![CI](https://github.com/phhien203/hp-flashcard/actions/workflows/ci.yml/badge.svg)](https://github.com/phhien203/hp-flashcard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@hp-flashcard/ui)](https://www.npmjs.com/package/@hp-flashcard/ui)

Monorepo for the **`@hp-flashcard/ui`** design system, built from the product's Figma file.

- **Storybook:** https://phhien203.github.io/hp-flashcard/
- **Package docs:** [packages/ui/README.md](packages/ui/README.md)

## Stack

pnpm workspaces (catalog-pinned) · React 19 · TypeScript 6 · Vite 8 · Tailwind CSS v4 · shadcn (Base UI) · Storybook 10 · Vitest 5 browser mode + Playwright (Chromium, Firefox, WebKit) · ESLint + Prettier · Husky + lint-staged · Changesets · GitHub Actions · Renovate

## Layout

```
packages/ui        @hp-flashcard/ui: components, tokens, stories, unit tests (published)
apps/storybook     Storybook app: renders and tests the stories from packages/ui (private)
```

## Getting started

Requires Node 24 (`.nvmrc`). pnpm comes from the `packageManager` field (`corepack enable`, or install pnpm 12).

```sh
pnpm install
pnpm exec playwright install --with-deps chromium   # once; add firefox webkit for test:all
pnpm dev                                            # Storybook at http://localhost:6006
```

## Scripts

| Script                 | What it does                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| `pnpm dev`             | Storybook dev server (components load from source, with HMR)         |
| `pnpm test`            | Unit + story tests (incl. axe a11y) in Chromium                      |
| `pnpm test:all`        | The same in Chromium, Firefox and WebKit (what CI runs)              |
| `pnpm test:watch`      | Vitest in watch mode                                                 |
| `pnpm lint` / `format` | ESLint / Prettier                                                    |
| `pnpm typecheck`       | `tsc --noEmit` everywhere                                            |
| `pnpm build`           | Build `@hp-flashcard/ui` into `packages/ui/dist`                     |
| `pnpm check:package`   | publint + are-the-types-wrong against the built package              |
| `pnpm build-storybook` | Static Storybook in `apps/storybook/storybook-static`                |
| `pnpm changeset`       | Record a version bump for your PR (see [RELEASING.md](RELEASING.md)) |

Choose browsers with `VITEST_BROWSERS`, e.g. `VITEST_BROWSERS=firefox pnpm test`.

## Contributing

- Conventions for humans and agents are in [AGENTS.md](AGENTS.md).
- The pre-commit hook lints and formats staged files. The pre-push hook runs `typecheck`.
- PRs that change `@hp-flashcard/ui` need a changeset (`pnpm changeset`).
