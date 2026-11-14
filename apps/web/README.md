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
4. **User & authentication → Account deletion** (or **Settings → Restrictions**, depending on the dashboard version): **disable** "Allow users to delete their accounts". The app also shows no profile or account-management UI. `worker/clerk.integration.test.ts` checks this setting (a new user's `delete_self_enabled` must be false).
5. **API keys:** copy the publishable key (`pk_test_…`) to `VITE_CLERK_PUBLISHABLE_KEY`, and the **JWT public key (PEM)** to `CLERK_JWT_KEY` (or the secret key, `sk_test_…`, to `CLERK_SECRET_KEY`).
6. **Webhooks:** add an endpoint for `https://<the Worker's origin>/api/webhooks/clerk`, subscribed to **`user.deleted`** only, and copy its signing secret (`whsec_…`) to `CLERK_WEBHOOK_SIGNING_SECRET`. A local Worker isn't reachable from Clerk; use a tunnel, or Clerk's "Testing" tab against a deployed one.

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

Every Card has a `contentVersion` (1 at creation, one more per edit) and a separate `progressVersion` (1 at creation, one more per Progress save). `PATCH` and `DELETE /api/cards/{id}` name the content version they were based on in `If-Match: "<version>"`; `PUT /api/cards/{id}/progress` names the Progress version. If that version has moved on, they answer `409 version_conflict` and change nothing. Each write checks and advances only its own version, in the same batch that records its idempotency key, so studying never makes an edit or a deletion stale, and an edit never makes a Progress save stale. A Progress save is an `UPDATE`, never an insert: one for a deleted Card answers `404` and brings nothing back.

The app then shows the latest version: the edit dialog shows it beside the unsaved changes, to keep them (and save over it) or take the latest; the delete confirmation shows it and asks again; Study Mode shows the Card's latest Progress and says another device changed it, and the next "I Know This" counts from there.

### Retrying a write

Creating, editing, deleting and saving Progress require an `Idempotency-Key`. The app sends one per intended write and repeats it when the user retries after a failure, until what is sent changes or the write succeeds. For 24 hours, the same key and request answer the original result again (`Idempotent-Replayed: true`) without applying it twice or using quota, even after later edits or the Card's deletion; a different request answers `422`. Keys belong to their account and operation. After 24 hours a record expires and its key writes anew; writes forget their owner's expired records, and a daily cron (`wrangler.jsonc`) deletes all expired ones.

A replayed result describes the Card as it was then. The app never stores it in its cache; it refetches instead, so a replay can't show older content over newer.

### Write rate limit and request bounds

Each account may make 60 write requests in any 60 seconds (ADR 0002), a sliding window kept in D1 (`write_requests`, `worker/rate-limit.ts`): one batch forgets the account's entries older than a minute and inserts this request's only if fewer than 60 remain, in one statement. D1 runs one write at a time, so every Worker instance counts the same requests and racing requests never get past 60; no instance keeps a counter of its own. Every write request that gets past authentication counts, whatever it answers, retries included. The 61st answers `429 rate_limited` with `Retry-After` (seconds until the oldest entry leaves the window), does nothing and isn't counted, so waiting and sending it again with the same idempotency key is safe. The app says how long to wait, beside the form or in Study Mode, and Retry repeats the same key.

The order of checks is: session (`401`), then the rate limit (`429`), then the body, which is read only up to 128 KiB (`413 payload_too_large`). Nothing is read or written for a request that fails one.

### Deleted identities

People can't delete their own accounts (Clerk setting above). When an administrator deletes one in Clerk, Clerk sends `user.deleted` to `POST /api/webhooks/clerk` (`worker/webhook.ts`). The Worker verifies its Standard Webhooks signature over the original body with `CLERK_WEBHOOK_SIGNING_SECRET` (Clerk's `verifyWebhook`, which also refuses timestamps more than five minutes off), then, in one batch: records the delivery id, records the identity in `deleted_identities`, and deletes its Cards, Categories, idempotency records (expired or not) and rate-limit entries. It answers `200` only after that commits; any failure answers `500` and Clerk delivers again. A repeated delivery id is acknowledged without being applied again; another delivery of the same deletion finds nothing to delete.

A Clerk session token stays valid until it expires (about a minute) after its user is deleted, so the Worker can't rely on Clerk alone. Every request checks `deleted_identities` after verifying the token and answers `401`. A request that passed that check before the purge committed is stopped in the database: triggers (`migrations/0003_deleted_identity_guards.sql`) refuse any insert for a deleted identity, rolling back its whole batch, and the Worker answers `401`. Updates and deletions find no rows. Clerk never reuses a user id, so the tombstones stay.

Restoring D1 (ADR 0005) can bring back both a purged Collection and its tombstone's absence; reconciling deleted identities after a restore is the recovery slice's work.

### Logs

`wrangler.jsonc` enables Workers Logs and Issues for every request; the Worker logs its own JSON records (`worker/log.ts`): one per API request with a request id (also sent as `X-Request-Id`), method, route pattern (`/api/cards/:cardId`, never the URL), status and latency; `api_error` with the error's class name for unexpected failures; and webhook outcomes by event type. Never Card text, emails, tokens, identities, request bodies or exception messages, which can quote stored values. Cloudflare's automatic invocation logs and traces are off for the same reason. `worker/logging.test.ts` checks this across validation, authentication, webhook and unexpected-error paths.

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

| Scenario            | Effect                                          |
| ------------------- | ----------------------------------------------- |
| `slow`              | Every Card listing takes 1.5 s                  |
| `empty`             | The backend starts with no Cards                |
| `initial-error`     | The first request for the first page fails      |
| `page-error`        | The first request for a later page fails        |
| `categories-error`  | The first Category listing fails                |
| `slow-writes`       | Every Card write takes 1.5 s                    |
| `create-error`      | The first Card creation fails                   |
| `edit-error`        | The first Card edit fails                       |
| `edit-not-found`    | The first Card edit finds no such Card          |
| `delete-error`      | The first Card deletion fails                   |
| `delete-not-found`  | The first Card deletion finds it gone           |
| `edit-conflict`     | Another device edits the Card first             |
| `delete-conflict`   | Another device edits the Card before a deletion |
| `progress-error`    | The first Progress save fails                   |
| `progress-conflict` | Another device saves the Card's Progress first  |
| `rate-limited`      | The first write gets `429`, retry after 30 s    |

## Tests

`pnpm test` runs three Vitest projects:

- `web` runs the assembled app in a real browser (UI → TanStack Query → fetch → MSW service worker) on the mock sign-in, with axe, keyboard and responsive checks.
- `web:contract` runs in Node: it validates the OpenAPI document, checks the generated types are fresh, and validates mock responses against the schemas.
- `web:worker` runs the Worker at its HTTP seam, through Wrangler's test harness: `wrangler.jsonc`, workerd, a local D1 built by the checked-in migrations. Session tokens are signed by a test key the Worker is given as `CLERK_JWT_KEY`, and verified by Clerk's own code; webhook deliveries are signed with a test secret given as `CLERK_WEBHOOK_SIGNING_SECRET`, and verified by Clerk's `verifyWebhook`. There is no test bypass. Responses are validated against the OpenAPI document. `progress.test.ts`, `lifecycle.test.ts`, `rate-limit.test.ts` and `logging.test.ts` cover Progress versions and retries, the deletion webhook and purge races, the rate window, and log contents.

`worker/clerk.integration.test.ts` holds the checks against a real Clerk development instance: a real session token through the Worker, a create/reload/study/edit/delete journey ending in an administrator deletion, and the configuration check that users can't delete themselves. It runs only with `CLERK_SECRET_KEY=sk_test_…` set, creates test users (`+clerk_test` addresses, so no email is sent), and deletes them afterwards.
