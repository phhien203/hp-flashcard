# Restore D1 only through a controlled recovery procedure

Use D1 Time Travel instead of a custom scheduled-backup system initially, with retention determined by the Cloudflare plan. A restore affects the entire database, not one Collection, and can bring back data deleted after the recovery point. Treat database recovery as a manual disaster-recovery operation, separate from application rollback.

## Recovery procedure requirements

- Block normal API traffic during restoration, verify the restored state, and reopen access only after verification.
- Continue processing Clerk deletion webhooks safely, or ensure durable delivery/retry without acknowledging an event that has not been safely retained.
- Reconcile deleted Clerk identities before reopening access so a restore does not leave resurrected Collections belonging to deleted users. Validate a reconciliation mechanism that remains authoritative even when D1 itself is restored.
- Before launch, rehearse restoration on a disposable remote D1 database containing synthetic data and the real migrations. This is not a standing staging environment.
- Record a bookmark, simulate data damage, restore, and verify Cards, Categories, Progress, versions, retry records, relationships, and subsequent reads/writes.
- Record recovery duration and results. Guard rehearsal tooling against the production database ID; remove disposable resources after the drill.
- Account for writes acknowledged after the recovery point, restored idempotency history, and interrupted requests in the recovery procedure.

## Observability

Enable Cloudflare Workers logging and error monitoring using request IDs, routes, response statuses, latency, and sanitized failures. Exclude question/answer content, emails, credentials, authentication tokens, and request bodies. Logging alone is not proof that an actionable alerting or recovery workflow has been configured.
