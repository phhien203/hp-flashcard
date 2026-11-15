# Coding Standards

These standards adapt _The Conscious React_, second edition (2026), by Petar I. Ivanov to this repository. This is a project-specific synthesis, not a requirement to adopt every pattern or tool in the book.

Apply these standards to new and changed React code in `apps/web` and `packages/ui`, including its stories and tests. Existing code is not automatically compliant: improve it within the scope of the task rather than starting an unrelated migration. Package, styling, release, and validation requirements remain in [AGENTS.md](AGENTS.md).

**Required** rules apply to changed code. **Prefer** rules are defaults; explain meaningful exceptions in the PR. Size and prop counts are review signals, not hard limits. Automated enforcement is described under [Enforcement](#enforcement); prose alone does not create a lint rule.

## Structure and boundaries

- **Prefer locality.** Keep a feature's components, hooks, helpers, and tests together. Small components can remain single files; introduce a folder when related pieces need a home. Follow the surrounding naming convention instead of renaming existing files.
- **Required:** keep `packages/ui` independent of `apps/*`. Application code consumes its public `@hp-flashcard/ui` API, not its source internals. UI components may express flashcard presentation, but must receive data and callbacks rather than importing application authentication, API clients, or routing.
- **Prefer independent features.** Share a focused domain function or UI component instead of importing another page's private implementation. Extract shared code once there is a concrete second use; avoid speculative `common/` or `utils/` collections.
- **Required:** keep reusable business rules in plain, React-independent functions. In the web app, `src/domain` already holds rules such as card validation and progress calculations. Hooks coordinate React state and lifecycle; a calculation does not need a hook just to be reusable.
- **Prefer adapters at integration boundaries.** Use the existing API client, authentication/session boundary, and design-system components. Wrap a dependency when the wrapper owns a meaningful application contract, not merely to rename every third-party export. Direct React and TanStack Query imports are appropriate.

### Imports and shared definitions

- **Required:** follow the relative `.js` import and public-export rules in `AGENTS.md` for `packages/ui`. The book's preference for absolute paths does not override published-package compatibility. Follow the web app's existing relative `.js` convention; this standard does not introduce aliases.
- **Prefer typed definitions** for repeated domain values and display mappings (`as const`, unions, and `satisfies` where useful). Ordinary one-off text does not need its own constant.
- **Required:** use `ROUTE_HREFS` in `apps/web/src/app/router.ts` for application navigation rather than duplicating route paths. Tests asserting the public URL contract may use literal URLs.
- **Required:** give helpers explicit missing/invalid-input behavior. Display formatters should return a consistent display type with an intentional fallback; parsers and validators should report invalid input explicitly, rather than fabricating valid domain data.

## Components and composition

- **Required:** use named function components with typed props. Destructure props when it makes their use clear; derive native or Base UI prop types where appropriate. Use `import type` for type-only imports.
- **Prefer top-down readability:** imports, types and module-level helpers, component hooks, derived values, handlers, then JSX. Keep Hooks in a valid, unconditional order before ordinary early returns.
- **Prefer one clear responsibility.** Separate substantial query/state orchestration from reusable presentation. A small component can coordinate a hook and render its result without needing a ceremonial container/presenter pair.
- **Prefer composition** through children and named slots over growing lists of flags for every layout variation. Group related props only when the object represents a meaningful concept, not to hide complexity.
- **Prefer the existing named-part API**, such as `Dialog`, `DialogContent`, and `DialogTitle`, for related UI pieces. The book's `Object.assign` dot-notation pattern is optional, not a reason to change the public library API.
- **Prefer guard clauses** for loading, errors, and missing data, and simple conditions in JSX. Extract a named child component when nested ternaries, repeated markup, or render helpers obscure intent. Define child component types at module scope so their identity remains stable.
- **Prefer custom hooks** for reusable stateful behavior instead of introducing HOCs or render-prop abstractions. Existing library render/composition APIs remain valid.
- **Prefer roughly 150 lines and five props as review prompts**, not quotas. Split by responsibility when readability suffers; markup-heavy pages and primitive components can reasonably exceed either number.
- **Prefer React 19's ref-as-prop** for new components where supported by the underlying API. Keep existing compatible APIs unless the task requires changing them.

## State ownership and effects

Choose the owner before adding state:

| Kind of state                                           | Default owner in this project                         |
| ------------------------------------------------------- | ----------------------------------------------------- |
| Server records, lists, statistics, and request status   | TanStack Query through `apps/web/src/app/queries.ts`  |
| Current route                                           | The existing hash router                              |
| Form drafts and validation display                      | The form or its colocated hook                        |
| Transient UI, such as an open dialog or revealed answer | The nearest component that needs it                   |
| Shared client workflow with coupled transitions         | A focused hook/reducer at the closest common ancestor |
| Cross-cutting dependencies, such as the API client      | A focused provider with a consumer hook               |

- **Required:** keep one authoritative owner. Derive values from props, query results, or existing state rather than synchronizing duplicate state through effects. Editable drafts may intentionally snapshot server data; define when they reset and how conflicts are handled.
- **Prefer local state**, lifting it only to the closest common ancestor that needs it. Use a reducer when several values must transition together, and expose intent-oriented operations rather than raw dispatch details to consumers.
- **Prefer focused Context providers** with guarded consumer hooks, following `useApi`. Keep providers near their consumers. A frequently changing global context is not the default state manager; consider a selector-based store only after a demonstrated need and a separate dependency decision.
- **Required:** render and state updaters stay pure. Put user-initiated writes in handlers or mutations; use effects to synchronize with external systems.
- **Required:** declare complete effect dependencies and clean up subscriptions, listeners, timers, and outstanding work. Fix stale closures instead of suppressing dependency warnings. Use functional state updates when the next value depends on the previous one.
- **Required:** handle stale async results. Pass Query's `AbortSignal` through the API client for reads; outside Query, cancel obsolete reads or guard against applying outdated results. Cancelling a client request does not undo a server mutation.

## Server data, forms, and recovery

- **Required:** use the existing API client and query/mutation hooks for application server data. Keep query keys and invalidation policy together in `queries.ts`; include every input that changes the result in the key.
- **Required:** refresh affected detail, list, category, and statistics caches through the shared mutation policy. Prefer invalidation over wiring per-component refresh flags. Preserve the existing handling of replayed writes, versions, and idempotency keys.
- **Required:** preserve server-confirmed saves and progress updates. Do not add optimistic UI, queued offline writes, or automatic write retries just because the book demonstrates them. Changing those semantics requires an explicit product decision and tests for failure and reconciliation.
- **Required:** represent pending, empty, error, and successful states intentionally. Keep entered form data on recoverable failures, explain errors beside the relevant field or action, and offer a meaningful recovery path.
- **Prefer feature-level error boundaries** where a rendering exception should leave the surrounding app usable. Handle expected API and mutation failures explicitly; error boundaries do not automatically catch asynchronous or event-handler failures.
- **Prefer Suspense** for lazy code or deliberately Suspense-enabled data sources. Ordinary `useQuery` loading/error branches remain valid; wrapping effect-based fetching in Suspense does not make it Suspense-aware.
- **Required:** retain the current Vite client-rendered architecture unless a separate task changes it. React Server Components, Server Actions, SSR, and streaming examples are not instructions to add a framework or server rendering. React form Actions are optional; do not create a competing mutation lifecycle alongside Query.

## Performance

**Required:** justify performance-driven complexity with a reproducible bottleneck and before/after evidence, such as React Profiler timings, a browser trace, or bundle output. Focus on real user paths: browsing, studying, filtering, and saving cards.

Prefer this order, measuring after each relevant change:

1. Move state closer to the component that owns it.
2. Restructure with composition so unrelated subtrees do not participate in updates.
3. Remove unnecessary work and stabilize references where identity affects a subscription or an expensive consumer.
4. Use `useMemo` or `useCallback` for a demonstrated computation or identity bottleneck.
5. Use `React.memo` when rendering is expensive and props can remain stable.

Inline callbacks and object literals are not defects by themselves. Memoization is an optimization, not a correctness guarantee.

- **Prefer code-splitting** at meaningful route or expensive optional-feature boundaries, with a usable loading fallback; avoid fragmenting tiny components.
- **Prefer transitions or deferred values** when measured non-urgent rendering blocks interaction. Keep controlled input updates urgent; scheduling does not make network requests faster.
- **Prefer `useEffect`** for synchronization; use `useLayoutEffect` only for pre-paint measurement or correction that would otherwise visibly flicker.
- **Required:** assess bundle impact when adding dependencies or large features. React Compiler remains deferred as recorded in `AGENTS.md`; do not assume it is enabled.

## Tests and accessibility

- **Required:** test observable behavior rather than component internals, hook call counts, or third-party implementations. Name tests after the user outcome and keep Arrange–Act–Assert easy to follow.
- **Prefer integration tests** for user flows and unit tests for pure domain rules. Cover the happy path and relevant empty, validation, network, authorization, stale-data, and retry cases. Each test should have one coherent scenario, which may require several assertions.
- **Required:** reuse `apps/web/src/test/render-app.tsx` and existing helpers for app integration tests. Mock network behavior with the existing MSW setup instead of replacing Query hooks or the API client with mocks.
- **Required:** keep tests isolated and deterministic. Control random seeds, time, network scenarios, and cache state through existing fixtures and setup; wait for observable results instead of arbitrary sleeps.
- **Prefer role and accessible-name queries**, then labels or visible text. Use a stable test ID only when user-facing selectors cannot express the target; avoid assertions on incidental Tailwind classes or broad DOM snapshots.
- **Required:** retain the real-browser test strategy and Storybook/a11y requirements in `AGENTS.md`. Playwright-backed Vitest integration tests are not full deployed-system E2E tests; add true E2E coverage for critical journeys when that infrastructure is introduced, rather than claiming it already exists.
- **Required:** use semantic controls, accessible names, associated labels and errors, and usable keyboard/focus behavior. Exercise changed interactive states, not only the initial render. Automated axe checks supplement, rather than replace, manual keyboard and screen-reader checks.

## Enforcement

ESLint, Prettier, and TypeScript configuration are the executable source of truth for their checks. Keep the existing pnpm catalog/lockfile, Husky hooks, Renovate, and Changesets workflow; this standard does not replace them with the book's alternative tools.

| Mechanism   | What it currently enforces                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| ESLint      | Configured JS/TS, React Hooks, Storybook, Tailwind correctness/token rules, and the UI alias restriction |
| Prettier    | Formatting, including configured Tailwind class sorting                                                  |
| TypeScript  | The enabled strictness checks, including unchecked indexed access                                        |
| Tests       | The behavior and accessibility scenarios actually covered by the suite                                   |
| Code review | Ownership, module boundaries beyond lint coverage, composition, recovery, and evidence for optimization  |

Review-only rules are still standards, not claims of automated enforcement. Introduce additional checks incrementally in a separate scoped change; this document does not enable `exactOptionalPropertyTypes`, commitlint, import-boundary plugins, E2E infrastructure, or visual regression testing.

### Review checklist

- [ ] New code has a clear home and does not depend on another feature's private implementation.
- [ ] Domain rules, server state, UI state, and drafts have intentional owners.
- [ ] Component APIs compose, and complexity or size exceptions have a reason.
- [ ] Effects have complete dependencies, cleanup, and stale-result handling where needed.
- [ ] Mutations preserve the project's cache, retry, version, and confirmation semantics.
- [ ] Relevant loading, empty, failure, recovery, and accessible interaction states are tested.
- [ ] Performance-specific abstractions have evidence, not speculative memoization.
- [ ] The applicable validation and release requirements in `AGENTS.md` pass.

## Git

- **Always rebase, never merge.** Integrate upstream changes with `git pull --rebase` (or `git rebase origin/main`), never with a merge commit, so history stays linear. To make plain `git pull` rebase by default, run `git config pull.rebase true` in your clone.
