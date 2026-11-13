# @hp-flashcard/web

The Flashcard product app: React, Vite, TanStack Query and the `@hp-flashcard/ui` design system. There is no real backend yet. A mock backend (MSW) answers the API in the browser.

```sh
pnpm dev:web        # http://localhost:5173
pnpm build:web
```

## API

- `api/openapi.yaml` is the API contract and its source of truth.
- `src/api/schema.d.ts` is generated from it. Run `pnpm generate:api` after editing the contract. `pnpm check:api` and the `web:contract` tests fail when the file is out of date.
- `src/api/client.ts` is the typed client, built on native `fetch`. App code reaches data only through it, via the hooks in `src/app/queries.ts`.

## Mock backend

`src/mocks/` holds the MSW handlers and an in-memory store seeded from `fixtures/cards.json`. The store lasts as long as the page: navigation keeps it, and a refresh restores the fixture.

In development, add `?scenario=` to the page URL to see the app's other states. Combine scenarios with commas, e.g. `?scenario=slow,page-error`. They aren't part of the API contract.

| Scenario           | Effect                                     |
| ------------------ | ------------------------------------------ |
| `slow`             | Every Card listing takes 1.5 s             |
| `empty`            | The backend starts with no Cards           |
| `initial-error`    | The first request for the first page fails |
| `page-error`       | The first request for a later page fails   |
| `categories-error` | The first Category listing fails           |

## Tests

`pnpm test` runs two Vitest projects:

- `web` runs the assembled app in a real browser (UI → TanStack Query → fetch → MSW service worker), with axe, keyboard and responsive checks.
- `web:contract` runs in Node: it validates the OpenAPI document, checks the generated types are fresh, and validates mock responses against the schemas.
