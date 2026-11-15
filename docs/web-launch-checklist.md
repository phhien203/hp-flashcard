# Flashcard launch checklist (#58)

Readiness of the authenticated, persistent Flashcard app on Cloudflare. Each line says what kind of evidence backs it:

- **Automated:** repository tests that run on every `pnpm test`.
- **Drill:** verified on disposable provider resources, with the report recorded.
- **Operator:** a credential or dashboard action not yet done or verified.

Nothing here authorizes a production restore, a deployment or public launch. **Status as of 2026-11-15: not ready to launch.** The items marked Operator below are open.

## Recovery (ADR 0005, [web-recovery.md](web-recovery.md))

| Item                                                                                                                                                   | Evidence                                                                                              | Status                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maintenance closes every Collection operation with `503 maintenance` before session or D1 access; health reports it; the UI says writes were not saved | Automated: `worker/recovery.test.ts`, `src/app/maintenance.test.tsx`, axe in `accessibility.test.tsx` | Done                                                                                                                                                                               |
| Deletion webhooks keep being processed during maintenance; `200` only after commit                                                                     | Automated: `worker/recovery.test.ts`, `worker/lifecycle.test.ts`                                      | Done                                                                                                                                                                               |
| Reconciliation against Clerk (outside D1) purges resurrected Collections; dry run and count confirmation; fails closed if Clerk is unavailable         | Automated (stand-in Clerk API)                                                                        | Done locally; real Clerk Backend API not exercised                                                                                                                                 |
| Reopening is refused before reconciliation, after a restore that undid it, and on inconsistent rows                                                    | Automated                                                                                             | Done                                                                                                                                                                               |
| Duplicate and delayed deletion events, and concurrent recreate attempts, after a restore                                                               | Automated                                                                                             | Done                                                                                                                                                                               |
| Restored and lost retry records, interrupted requests, writes lost after the restore point                                                             | Automated (bookmark stand-in) and documented                                                          | Done locally                                                                                                                                                                       |
| **Remote Time Travel drill** on a disposable D1 database: bookmark, damage, restore, verify, reconcile, reopen, delete                                 | Drill: `apps/web/scripts/recovery-drill.mjs`                                                          | **Blocked.** Run on 2026-11-15, it stopped with "Wrangler is not authenticated: the drill is blocked." It created nothing. **Not complete.** Recovery duration is not yet measured |
| Plan-dependent Time Travel retention (7 days Free, 30 days Paid) checked for the actual account                                                        | Operator                                                                                              | **Open:** record the plan here                                                                                                                                                     |

## Launch verification still open

These items from the #58 launch ticket have **no new evidence from this work**. Don't treat them as done:

| Item                                                                                                                                                         | Status                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Real-backend browser suite: sign-in gating, empty first Collection, create/reload/study/edit/delete, cross-device visibility, account isolation, without MSW | **Open.** Browser tests use MSW. Worker tests cover the API on real local D1 with locally signed sessions            |
| Clerk production verification: email codes, open registration, design-system styling, production origins, no self-service deletion                           | **Open (Operator).** Needs the production Clerk instance, which doesn't exist yet ([web-release.md](web-release.md)) |
| Audit of user-facing errors, conflicts, safe retries, quota and rate feedback, draft recovery, account-switch races, refocus refresh, private cache          | **Partial.** Existing tests cover these against MSW. This work added maintenance. No separate audit report           |
| Production configuration: no mock fallback, fixture seeding, auth bypass, sensitive logs, `workers.dev` or preview URLs                                      | **Partial.** `release-policy.mjs` checks aliases, domain and origin. Dashboard state is unverified                   |
| Cross-browser pointer and focus checks, including styled Clerk                                                                                               | **Partial.** CI runs Chromium, Firefox and WebKit on the MSW app. Styled Clerk is unverified                         |
| Cloudflare Builds connection, build-token D1 permission, runtime secrets, Custom Domain, queue behaviour                                                     | **Open (Operator).** See [web-release.md](web-release.md)                                                            |

## To run the drill

1. Use a scoped `CLOUDFLARE_API_TOKEN` with D1 edit for account `5f7f25968ee22b7e1719fb064620973b`, ideally a temporary token.
2. Run `node apps/web/scripts/recovery-drill.mjs --confirm-disposable --report drill.json`.
3. Paste the report's outcome, `durationsMs.restore`, and the checks into the table above. If `cleanedUp` is false, delete the named `hp-flashcard-drill-*` database by hand.
