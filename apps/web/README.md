# @hp-flashcard/web

The Flashcard product app: React, Vite, TanStack Query and the `@hp-flashcard/ui` design system, signed in with Clerk, on a Cloudflare Worker (Hono, D1, Drizzle ORM). Each person has a private Collection (see `GLOSSARY.md` and `docs/adr/`).

## Modes

The app runs in one of two explicit modes. Nothing falls back from one to the other.

| Mode | Start                             | Sign-in                      | API                                         |
| ---- | --------------------------------- | ---------------------------- | ------------------------------------------- |
| Real | `pnpm dev:api` and `pnpm dev:web` | Clerk (development instance) | The Worker on a local D1 database           |
| Mock | `pnpm dev:web:mock`               | A mock account picker        | MSW in the browser, seeded from the fixture |

- **Real** is the default for `vite` and the only mode of a production build (`pnpm build:web`). It never starts MSW, seeds fixture Cards or keeps data in memory. Without `VITE_CLERK_PUBLISHABLE_KEY` it says sign-in isn't configured; without Clerk secrets the Worker refuses every API request.
- **Mock** is Vite's `--mode mock`, development only: production builds drop it (and MSW, and the fixture) entirely. The demo account starts with the fixture's 40 Cards; any other account starts empty. Tests use it too.

## Local development (real mode)

1. Do the human-only Clerk setup below, then copy `.env.example` to `.env.local` and `.dev.vars.example` to `.dev.vars`, and fill in the development instance's keys.
2. `pnpm dev:api` applies the migrations to a local D1 database (under `.wrangler/`, never production) and starts the Worker on http://localhost:8787.
3. `pnpm dev:web` serves the app on http://localhost:5173, proxying `/api` to the Worker.

`pnpm build:web` builds the frontend into `dist/`, which `wrangler.jsonc` serves alongside the Worker.

## Human-only setup

Credentials and accounts can't be created from this repository. Nothing here is configured yet; these are the steps a person with access takes.

**Clerk (development instance, for local work):**

1. Create an application; its development instance is the local one.
2. **User & authentication → Email:** enable sign-in with email and **email verification code** (one-time code). Turn passwords off.
3. **Restrictions:** keep sign-up **public** (open registration).
4. **User & authentication → Account deletion** (or **Settings → Restrictions**, depending on the dashboard version): **disable** "Allow users to delete their accounts". The app also shows no profile or account-management UI.
5. **API keys:** copy the publishable key (`pk_test_…`) to `VITE_CLERK_PUBLISHABLE_KEY`, and the **JWT public key (PEM)** to `CLERK_JWT_KEY` (or the secret key, `sk_test_…`, to `CLERK_SECRET_KEY`).

**Clerk (production instance)**, when the deployment slice ships: the same settings, plus the `flashcard.hien.page` domain; its keys go only into Cloudflare secrets, never into local files.

**Cloudflare**, when the deployment slice ships: create the production D1 database (`wrangler d1 create hp-flashcard`) and put its id in `wrangler.jsonc` (the checked-in id is a placeholder that matches no database); set the Worker secrets (`wrangler secret put CLERK_JWT_KEY`, `CLERK_AUTHORIZED_PARTIES=https://flashcard.hien.page`). This slice deploys nothing.

## Database

- `worker/db/schema.ts` is the Drizzle schema. After changing it, run `pnpm --filter @hp-flashcard/web db:generate` and review the SQL it writes to `migrations/`. Migrations Drizzle Kit can't express (the quota trigger, `0001_card_quota.sql`) are custom migrations (`drizzle-kit generate --custom`). Migrations are checked in, never pushed to a database directly.
- `pnpm --filter @hp-flashcard/web db:migrate:local` applies them to the local database.
- Every row has an owner: the Clerk user id of the verified session token. No request field can name one.

### Writes and D1 transactions

D1 has no interactive transactions; a **batch** runs its statements as one transaction, all or nothing. Creating a Card is one batch: match or create the Category, insert the Card, record the idempotency key with the response. The database enforces what must hold however requests race:

- **Category matching:** a unique index on (owner, trimmed lower-cased name). Racing creations of equivalent names share one Category, spelled as the first one.
- **The 1,000-Card quota:** a trigger refuses the insert at 1,000, rolling the whole batch back. D1 runs one write at a time, so the count and the insert can't interleave.
- **Idempotency:** the record's primary key is (owner, operation, key), so a key completes once.

Editing and deleting are a batch each too, conditioned on the Card's `content_version`. The batch first records the idempotency key, but only while the Card is still at the version the request names; the edit (which advances the version) or the deletion runs under the same condition; then Categories left without Cards are deleted. Nothing recorded means nothing changed: a read then tells a missing Card (`404`) from a changed one (`409`). A deleted Card's place in the quota is free when its batch commits.

The Worker tests exercise these with concurrent requests on a real local D1.

### Versions and conflicts

Every Card has a `contentVersion` (1 at creation, one more per edit). `PATCH` and `DELETE /api/cards/{id}` name the version they were based on in `If-Match: "<version>"`. If the Card has changed since, they answer `409 version_conflict` and change nothing. The app then shows the latest version: the edit dialog shows it beside the unsaved changes, to keep them (and save over it) or take the latest; the delete confirmation shows it and asks again. Progress, in the next slice, gets its own version, so studying won't conflict with an edit.

### Retrying a write

Creating, editing and deleting require an `Idempotency-Key`. The app sends one per intended write and repeats it when the user retries after a failure, until what is sent changes or the write succeeds. For 24 hours, the same key and request answer the original result again (`Idempotent-Replayed: true`) without applying it twice or using quota, even after later edits or the Card's deletion; a different request answers `422`. Keys belong to their account and operation. After 24 hours a record expires and its key writes anew; writes forget their owner's expired records, and a daily cron (`wrangler.jsonc`) deletes all expired ones.

A replayed result describes the Card as it was then. The app never stores it in its cache; it refetches instead, so a replay can't show older content over newer.

### Sessions, connectivity and caching

- The app needs a connection. A write that gets no response fails at once and says so; nothing is queued or saved for later, and drafts live only in memory.
- If the session ends without signing out (it expired) while an edit is unsaved, the edit is kept in memory. The same account signing in again gets the edit dialog back, with its idempotency key, to retry explicitly; any other account signing in makes it forgotten, as does signing out.
- Data refetches on reload, on returning to the window, and after every write. There is no real-time sync.
- Every API response carries `Cache-Control: private, no-store` and `Vary: Authorization`, so no shared cache serves one person's data to another.

### Card text

`src/domain/card-text.ts` holds the rules the forms, the mock and the Worker share: trimmed with `String.prototype.trim()`; nonblank; at most 2,000 (question), 10,000 (answer) and 100 (Category) characters, counted in Unicode code points after trimming (an emoji is one, a letter with a combining accent is two), as SQLite's `length()` counts in the database's own checks; no lone surrogates or NUL characters (SQLite's `length()` stops at a NUL); stored without Unicode normalization. Category names match ignoring case (`toLowerCase()`) and surrounding whitespace.

## API

- `api/openapi.yaml` is the API contract and its source of truth.
- `src/api/schema.d.ts` is generated from it. Run `pnpm generate:api` after editing the contract. `pnpm check:api` and the `web:contract` tests fail when the file is out of date.
- `src/api/client.ts` is the typed client, built on native `fetch`. App code reaches data only through it, via the hooks in `src/app/queries.ts`.

## Mock backend

`src/mocks/` holds the MSW handlers and in-memory Collections per account: the demo account's is seeded from `fixtures/cards.json`, others start empty. Requests need a mock session token (`src/mocks/identity.ts`), which only the mock understands. The store lasts as long as the page: navigation keeps it, and a refresh restores the fixture.

In mock mode, add `?scenario=` to the page URL to see the app's other states. Combine scenarios with commas, e.g. `?scenario=slow,page-error`. They aren't part of the API contract.

| Scenario           | Effect                                          |
| ------------------ | ----------------------------------------------- |
| `slow`             | Every Card listing takes 1.5 s                  |
| `empty`            | The backend starts with no Cards                |
| `initial-error`    | The first request for the first page fails      |
| `page-error`       | The first request for a later page fails        |
| `categories-error` | The first Category listing fails                |
| `slow-writes`      | Every Card write takes 1.5 s                    |
| `create-error`     | The first Card creation fails                   |
| `edit-error`       | The first Card edit fails                       |
| `edit-not-found`   | The first Card edit finds no such Card          |
| `delete-error`     | The first Card deletion fails                   |
| `delete-not-found` | The first Card deletion finds it gone           |
| `edit-conflict`    | Another device edits the Card first             |
| `delete-conflict`  | Another device edits the Card before a deletion |
| `progress-error`   | The first Progress save fails                   |

## Tests

`pnpm test` runs three Vitest projects:

- `web` runs the assembled app in a real browser (UI → TanStack Query → fetch → MSW service worker) on the mock sign-in, with axe, keyboard and responsive checks.
- `web:contract` runs in Node: it validates the OpenAPI document, checks the generated types are fresh, and validates mock responses against the schemas.
- `web:worker` runs the Worker at its HTTP seam, through Wrangler's test harness: `wrangler.jsonc`, workerd, a local D1 built by the checked-in migrations. Session tokens are signed by a test key the Worker is given as `CLERK_JWT_KEY`, and verified by Clerk's own code; there is no test bypass. Responses are validated against the OpenAPI document.

`worker/clerk.integration.test.ts` is the one check against a real Clerk development instance. It runs only with `CLERK_SECRET_KEY=sk_test_…` set, creates a test user (a `+clerk_test` address, so no email is sent), and deletes it afterwards.
