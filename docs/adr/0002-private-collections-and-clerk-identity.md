# Require Clerk identity for private Collections

Each person owns a private Collection accessible across devices, with no sharing, collaboration, or guest-to-account migration in the first version. Require Clerk email one-time-code authentication and allow open registration; new Collections start empty. Clerk owns authentication rather than the application storing passwords or implementing email delivery.

## Consequences

- Scope Cards, Categories, Progress, counts, statistics, and idempotency records to the authenticated identity. Never accept ownership from a client-supplied user identifier.
- Enforce the agreed 1,000-Card-per-user limit atomically, including simultaneous creation requests.
- Enforce maximum text lengths consistently in the frontend and API: 2,000 characters for questions, 10,000 for answers, and 100 for Category names. These are new limits, not existing frontend behavior; retain trimming and nonblank validation.
- Limit authenticated users to 60 write requests per minute, returning `429` when exceeded. Distributed enforcement semantics require technical validation; a Worker-local counter is not a global per-user limit.
- Use Clerk's prebuilt sign-in/sign-up components with design-system styling and standard Clerk form structure. Keep Clerk-specific integration in the application rather than the published UI library.
- Users cannot delete their own accounts; remove that capability from Clerk's user-facing configuration/UI. Administrator deletion in Clerk permanently purges the associated Collection through a verified, replay-safe deletion webhook.
- Card deletion permanently removes the Card and its Progress; no trash or restore feature.
- Clear cached private data on sign-out/account changes. Preserve an unsaved edit in memory during reauthentication only for the same account, then require explicit retry; clear it when a different account signs in.
- Require internet access; do not implement offline writes or queued synchronization. Refresh relevant data on reload, window refocus, and relevant actions, without real-time infrastructure.
