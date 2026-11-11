# AGENTS.md

`@hp-flashcard/ui` is a published design system (public npm, MIT), built from a Figma file. `packages/ui` holds the library; `apps/storybook` renders and tests its stories. Scripts are in the root `package.json`, and pinned versions in the `pnpm-workspace.yaml` catalog.

Before handing work back, it must be **green**: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`. Any change to exports, the build, or dependencies of `packages/ui` also needs `pnpm build && pnpm check:package`.

## packages/ui source rules

These exist because `dist/` (the JS and the `.d.ts` files emitted by `tsc`) must work for consumers on any `moduleResolution`. `pnpm check:package` (attw) catches violations.

- **Relative imports with `.js` extensions**: `import { cn } from "../../lib/utils.js"`. TypeScript and Vite map `.js` to the `.ts`/`.tsx` source. `tsc` copies import paths into `.d.ts` files verbatim, so `@/` aliases and `.tsx` extensions ship broken types.
- **Public API = `src/index.ts`**, a single barrel. Every new component gets a named export there, plus its `Props` type.
- **Components do not import CSS.** Styling is Tailwind classes only. `sideEffects` covers only `**/*.css`, which keeps the barrel tree-shakable.
- **Dependencies:** `react` and `react-dom` are peers. Runtime libraries go in `dependencies` (Vite externalizes everything listed in `dependencies` and `peerDependencies`). Everything else is a `devDependency`. Versions go in the catalog, and the package uses `"catalog:"`.

## Adding a shadcn component

shadcn is a starting point: generated code is ours to reshape to the Figma design. The style is `base-nova`, built on **Base UI** (`@base-ui/react`), not Radix.

1. `pnpm --filter @hp-flashcard/ui shadcn add <name>`
2. Rewrite the generated `@/…` and `cn` imports to relative `.js` imports (`../../lib/utils.js`).
3. If the component uses shadcn's custom variants (`data-open:`, `data-checked:`, …) or `tw-animate-css`, copy the needed `@custom-variant` blocks from `node_modules/shadcn/dist/tailwind.css` into `src/styles/theme.css`. The `shadcn` package is dev-only, so `theme.css` must not import it.
4. Export the component from `src/index.ts`, and add a colocated `<name>.stories.tsx` and `<name>.test.tsx`.

## Styles and tokens

- `src/styles/theme.css` is the **token source**: CSS variables plus `@theme inline`. It ships as `@hp-flashcard/ui/theme.css` for consumers on Tailwind v4. Its `@source "../"` resolves relative to the file, so it scans `src/` here and `dist/` once published. Keep that line.
- `src/styles/styles.css` is the entry the Tailwind CLI compiles into the precompiled `@hp-flashcard/ui/styles.css`.
- The tokens are **placeholders** (shadcn defaults) until the Figma tokens arrive. The one deliberate deviation is light `--destructive`, darkened to red-700 to pass contrast checks.

## Storybook and tests

- `apps/storybook` resolves `@hp-flashcard/ui` to **source** through the `@hp-flashcard/source` export condition (Vite `resolve.conditions` plus TS `customConditions`), so no build is needed during development. Tailwind's CSS `@import` ignores that condition, which is why `.storybook/preview.css` imports `theme.css` by relative path.
- Stories are colocated with their components in `packages/ui/src` and are excluded from the build and from `styles.css`. Write CSF3 with `play` functions for behaviour.
- Every story is also a Vitest test, and axe a11y violations **fail** it (`a11y.test: "error"`). Fix the component or token. Use a per-story `parameters.a11y` override only with a comment explaining why.
- Vitest runs in browser mode (Playwright). `VITEST_BROWSERS` picks the browsers (`chromium` by default). CI runs Chromium, Firefox, and WebKit, so avoid engine-specific APIs and selectors.

## Changes and releases

- Changes to `@hp-flashcard/ui` need a changeset (`pnpm changeset`) with a consumer-facing summary. The process is in `RELEASING.md`.
- TypeScript stays on 6.x (Renovate is capped at `<7`). Moving to TS 7 is a deliberate decision.

## Deferred (not set up yet)

Figma token sync and Code Connect, visual regression testing (Chromatic is the candidate), React Compiler, and per-component subpath exports.
