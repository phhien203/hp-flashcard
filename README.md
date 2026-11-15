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

## Codex fallback for the agent factory

The existing `agent:explore`, `agent:implement` and `agent:review` labels still
use Claude. Their `:gpt` counterparts use Codex with a ChatGPT subscription:

- `agent:explore:gpt` explores only issues carrying that label, then stops for
  a human decision.
- `agent:implement:gpt` opens a draft PR and labels it `agent:review:gpt`.
- `agent:review:gpt` reviews and fixes a same-repository PR independently.

The GPT entry workflows reuse the original workflows, including their checks,
GitHub-token isolation and failure handling. Implementation and review runs on
the same ticket or PR serialize across providers; exploration batches queue
separately for each provider. Choose one provider label per issue or PR at a
time; changing the label does not resume a failed Claude session.

### Subscription login

Codex has no Claude-style `setup-token` command. Sign in locally with file-based
credential storage, then upload the **whole login file** as an Actions secret:

```sh
npm install -g @openai/codex
codex -c 'cli_auth_credentials_store="file"' login
gh secret set CODEX_AUTH_JSON --repo phhien203/hp-flashcard < ~/.codex/auth.json
```

If you set `CODEX_HOME`, use its `auth.json` instead. Never print, commit or
paste this file into an issue or chat: it contains account credentials.
The runner restores it privately for the agent step and deletes it afterward.
The GPT workflows also need the existing `FACTORY_PAT`, but not a Claude secret.

Codex refreshes login credentials locally; runners cannot persist those updates
back into the GitHub secret. If authentication expires or refresh fails, sign in
again and replace the secret. Avoid sharing the same cached login across many
concurrent runners. OpenAI [recommends API keys for CI](https://developers.openai.com/codex/auth/);
subscription login is a maintenance tradeoff, not a permanent CI credential.

Create the trigger labels once, before using the workflows on the default branch:

```sh
gh label create agent:explore:gpt --color 5319E7 --description "Explore tickets with Codex"
gh label create agent:implement:gpt --color 5319E7 --description "Implement a ticket with Codex"
gh label create agent:review:gpt --color 5319E7 --description "Review a pull request with Codex"
```

The default model is `gpt-6.1-sol` with high reasoning effort. Set the repository
Actions variable `CODEX_MODEL` to override it with a model available to your plan.

## Contributing

- Conventions for humans and agents are in [AGENTS.md](AGENTS.md).
- React architecture, state, component, and testing standards are in [CODING_STANDARDS.md](CODING_STANDARDS.md), adapted from _The Conscious React_ (2026).
- The pre-commit hook lints and formats staged files. The pre-push hook runs `typecheck`.
- PRs that change `@hp-flashcard/ui` need a changeset (`pnpm changeset`).
