# D1 recovery runbook

How an operator recovers the production D1 database `hp-flashcard` ([ADR 0005](adr/0005-recovery-with-identity-reconciliation.md)). Recovery is a **manual disaster-recovery operation for the whole database**. It is never an automatic release rollback, never part of a deployment, and never a per-Collection feature. For code-only rollback, see [web-release.md](web-release.md).

This runbook doesn't authorize a production restore. Run the [rehearsal](#rehearsal-disposable-database) first. Restore production only when someone with authority decides the data loss described below is acceptable.

## What Time Travel does and doesn't do

D1 Time Travel is the only backup mechanism. There is no custom backup system. Per [Cloudflare's Time Travel reference](https://developers.cloudflare.com/d1/reference/time-travel/), checked 2026-11-15:

- **Retention depends on the plan:** 30 days on Workers Paid, **7 days on Workers Free**. Don't assume Paid. During setup, check the account's actual plan in the Cloudflare dashboard (Workers & Pages → Plans) and record it in the [launch checklist](web-launch-checklist.md). Bookmarks older than the retention window can't be restored.
- **A restore overwrites the entire remote database in place.** That covers every Collection, plus tombstones, webhook delivery ids, retry records, rate-limit entries and the `recoveries` table.
- **In-flight queries and transactions are cancelled**, and their clients get errors. Maintenance (below) keeps app traffic away. Clerk webhooks may still hit a cancelled query: they answer `500` and Clerk retries.
- **Writes acknowledged after the restore point are lost**, even though the app told people they were saved. This includes Card creations, edits, deletions and Progress saves, and also deletion purges. Purges are redone by reconciliation; the other writes are not.
- Each restore prints the bookmark from before it. Restoring to that bookmark undoes the restore, within retention.
- A newer bookmark doesn't prove the data changed: Cloudflare maintenance can advance it. Compare counts instead.
- The database must use the production storage backend (`wrangler d1 info hp-flashcard` shows `version: production`).

### Idempotency and retries after a restore

ADR 0003's guarantee is that a retry within 24 hours replays the original result. That guarantee **does not survive a restore unchanged**:

- **Retry records from before the restore point come back.** A retry of such a write still replays, unless the record had already expired at the restore point.
- **Retry records written after the restore point are lost**, with their writes. A client retrying one of those writes with the same `Idempotency-Key` gets it applied again as a new write. A retried creation creates a new Card with a new id, and a retried edit or Progress save is checked against the restored version. That usually means `409 Conflict`, which shows the person the restored Card to review.
- **Expired or missing records** behave as they always do: the retry is a new request.
- **Requests interrupted by the restore** got an error or no answer. The app never reports them as saved. Retrying after reopening behaves like the cases above.
- **Deletions after the restore point are undone.** Cards someone deleted reappear. A stale request still can't recreate a deleted Card, because the restored Card exists again and is checked by version.

Tell affected people in plain terms that changes made after the recovery point may need to be redone.

## Controls

| Control                                    | Where                                | Survives a D1 restore? |
| ------------------------------------------ | ------------------------------------ | ---------------------- |
| `RECOVERY_EPOCH` (new value per recovery)  | Worker secret/variable               | Yes, it's outside D1   |
| `RECOVERY_ADMIN_TOKEN` (operator bearer)   | Worker secret                        | Yes                    |
| `CLERK_SECRET_KEY` (production instance)   | Worker secret, for the recovery only | Yes                    |
| `recoveries` row: reconciled / reopened    | D1                                   | No: rolled back        |
| Deletion authority: which identities exist | **Clerk** (Backend API `/v1/users`)  | Yes, it's outside D1   |

- While `RECOVERY_EPOCH` is set, every Collection request answers **`503 maintenance`** with `Retry-After: 300`. This happens before any session check or D1 read, so nothing is read, written or counted against the rate limit. The app explains the outage and says that refused writes were **not** saved. `/api/health` keeps answering, with `"maintenance": true`. If D1 can't answer, for example during a restore, the API stays closed.
- **Clerk webhooks stay open.** `user.deleted` is processed during maintenance as usual: it answers `200` only after the purge commits, and `500` otherwise, so Clerk (Svix) retries. A purge committed after the restore point is lost by the restore. Reconciliation redoes it.
- **Reconciliation authority is Clerk, not D1.** A deletion ledger inside D1 would be rolled back with everything else. Clerk never brings back a deleted user and never reuses an id. Reconciliation asks Clerk which owners in D1 still exist, then purges and tombstones the rest.
- **Reopening is gated in D1, so a restore can only close the API.** `POST /api/recovery/reopen` succeeds only if this epoch's reconciliation is in the database as it is now, and the database holds no inconsistent rows. A later restore rolls the reconciliation back, so the API stays closed until someone reconciles again.

The `/api/recovery` endpoints exist only while both `RECOVERY_EPOCH` and `RECOVERY_ADMIN_TOKEN` are set. They are documented in `apps/web/api/openapi.yaml` (tag `Recovery`).

## Production procedure

Record the time of each step, and the outcome of each command, in the incident notes.

1. **Decide and freeze.** Confirm that a database-wide restore is justified. Pause Cloudflare automatic builds and wait for any running builds to finish, because a deployment must not race recovery. Choose the recovery point from evidence: `wrangler d1 time-travel info hp-flashcard --timestamp=<RFC3339>`. Check it is inside the plan's retention.
2. **Close the API.** Generate a fresh epoch, e.g. `recovery-2026-11-15T1200Z`, and a long random admin token. Set them as Worker secrets, together with the production Clerk instance's `CLERK_SECRET_KEY`:
   ```sh
   cd apps/web
   pnpm exec wrangler secret put RECOVERY_ADMIN_TOKEN --env production
   pnpm exec wrangler secret put CLERK_SECRET_KEY --env production
   pnpm exec wrangler secret put RECOVERY_EPOCH --env production   # last: this closes the API
   ```
   Check that `curl -s https://flashcard.hien.page/api/health` shows `"maintenance": true`, and that `/api/cards` answers `503`.
3. **Restore.** Run `pnpm exec wrangler d1 time-travel restore hp-flashcard --bookmark=<bookmark> --env production`, and record the printed undo bookmark.
4. **Inspect.** Run `curl -H "Authorization: Bearer $TOKEN" https://flashcard.hien.page/api/recovery`. It reports counts of owners, Cards, Categories, retry records and tombstones, plus `consistent`. Compare the counts with the evidence from before the incident.
5. **Reconcile deleted identities.** Do a dry run first:
   ```sh
   curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"purge":false}' https://flashcard.hien.page/api/recovery/reconcile
   ```
   Check `deleted` against Clerk's audit of deleted users. A count close to `ownersChecked` means the secret key belongs to the wrong Clerk instance: **stop**. Then purge, naming the count you checked: `-d '{"purge":true,"expectedDeleted":N}'`. A different count purges nothing (`409`). If Clerk is unavailable, nothing changes (`502`); retry later.
6. **Verify.** Run `GET /api/recovery` again: `consistent: true`, and `deletedIdentityRows: 0`. Spot-check with an operator-owned account only after reopening. Don't read people's Card text.
7. **Reopen.** Run `curl -X POST -H "Authorization: Bearer $TOKEN" https://flashcard.hien.page/api/recovery/reopen`. Check `/api/health` shows `"maintenance": false`.
8. **Clean up.** Delete `RECOVERY_EPOCH`, `RECOVERY_ADMIN_TOKEN` and `CLERK_SECRET_KEY` with `wrangler secret delete … --env production`. Without the epoch the API stays open and `/api/recovery` answers `404`. Resume automatic builds. Record the duration from step 2 to step 7.

If you restore again during the same incident, start over from step 2 with a **new** epoch.

## Rehearsal (disposable database)

`apps/web/scripts/recovery-drill.mjs` rehearses the procedure end to end on a **disposable remote** D1 database. It never touches production, and routine tests and CI never run it.

```sh
CLOUDFLARE_API_TOKEN=… node apps/web/scripts/recovery-drill.mjs --confirm-disposable --report drill.json
```

The drill:

1. Creates `hp-flashcard-drill-<timestamp>`. The guard (`recovery-drill-policy.mjs`, unit-tested) refuses the production id and name from `wrangler.jsonc`, and any name without the drill prefix.
2. Applies the real migrations, then seeds synthetic Cards, Categories, Progress, versions, retry records and rate-limit entries for three synthetic owners.
3. Records a bookmark. After it, the drill purges one owner (as its webhook would), acknowledges a late write, and damages the data.
4. Restores with Time Travel, and verifies every Card's values, versions, Progress, ownership and Category, plus counts and relationships. It also checks that the purged owner came back without its tombstone.
5. Runs the real Worker (`wrangler dev`, bound to the remote drill database) with a recovery epoch and a stand-in Clerk that knows the two kept owners. It checks maintenance `503`, reopen refused, reconcile dry run (1) and purge, and reopen. It then checks reads, a versioned edit, and that the deleted owner gets `401`.
6. Deletes the database whatever happened, and prints a JSON report with durations (`restore`, …) and each check.

Record each drill's report in the [launch checklist](web-launch-checklist.md). No drill has run on remote D1 yet: see that checklist.

Local, automated coverage of the same behaviour is `apps/web/worker/recovery.test.ts`. It runs at the Worker's HTTP seam on real local D1, with a whole-database snapshot standing in for Time Travel, which only exists remotely.
