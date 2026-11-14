# Protect independent edits and uncertain retries

Multiple devices can modify the same Collection even without live synchronization. Reject stale writes using optimistic concurrency, with separate content and Progress versions so studying does not invalidate an unrelated content edit. Use operation idempotency to distinguish a retry after a lost response from a new write.

## Write semantics

- Check the expected version and perform the update atomically. Return `409 Conflict` for a stale write; preserve unsaved content and require review/reload rather than silently overwriting newer data.
- Content edits check and advance the content version; Progress updates check and advance the Progress version.
- Deletion checks the content version. An intervening content edit blocks deletion; a Progress-only change does not.
- A stale request must never recreate a deleted Card.
- Preserve existing absolute Progress updates and the zero-to-five model; do not introduce spaced-repetition scheduling.
- Protect all Card writes—creation, content edits, Progress updates, and deletion—with idempotency keys and 24-hour retry records.
- A retry of a completed operation acknowledges the original result without reapplying the mutation, even if versions have since advanced. Treat deliberately submitting identical Card text with a new key as a new creation.

## Implementation requirements

Bind keys to the authenticated owner and operation, detect key reuse with different request contents, and make mutation results and retry records atomic. Verify the design against D1's supported transactional/batch behavior rather than assuming interactive SQL transactions are available. Replayed responses must not regress newer frontend cache state; retention cleanup must not prevent a user-deletion purge.
