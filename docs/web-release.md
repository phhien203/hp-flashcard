# Cloudflare-native application releases

Pushes to **`main` changing `apps/web/*`** trigger Cloudflare Workers Builds directly through its Git integration. Cloudflare builds, applies reviewed D1 migrations, deploys the Worker/assets, and checks `https://flashcard.hien.page`. **No Cloudflare credentials or deployment jobs belong in GitHub Actions.** UI-package publishing is unchanged.

This policy supersedes the tagged/GitHub-orchestrated parts of #63 and ADR 0004; see [ADR 0006](adr/0006-cloudflare-native-main-releases.md).

## Cloudflare dashboard setup

An operator must configure **Workers & Pages → hp-flashcard → Settings → Build**:

| Setting                     | Value                                             |
| --------------------------- | ------------------------------------------------- |
| Git repository              | `phhien203/hp-flashcard`                          |
| Production branch           | `main`                                            |
| Root directory              | `/` (the pnpm workspace root, **not** `apps/web`) |
| Build command               | `pnpm web:remote-build`                           |
| Deploy command              | `pnpm web:remote-deploy`                          |
| Preview builds              | disabled                                          |
| Build watch paths — include | `apps/web/*`                                      |
| Build watch paths — exclude | none                                              |
| Node / pnpm                 | Node 24 / pnpm 12.18.0                            |
| Build variable              | `VITE_CLERK_PUBLISHABLE_KEY=pk_live_…`            |

These are **provider-side settings**, not Wrangler configuration. Saving source files does not connect the repository or enable the trigger. Cloudflare's Git integration checks out the commit from the push; scripts verify it against `WORKERS_CI_COMMIT_SHA`, require `WORKERS_CI_BRANCH=main`, and record `WORKERS_CI_BUILD_UUID`. Do not override these system variables.

Cloudflare's `*` path wildcard covers nested files, so `apps/web/*` covers frontend, Worker, migrations and the app's release scripts. Per the provider's documented exceptions, empty pushes, pushes with 3,000+ changed files, or 20+ commits can bypass watch-path filtering.

**Workspace caveat:** changes only to `packages/ui`, root dependencies/lockfile or shared configuration do not normally trigger this app-only watch rule. When such changes need a web deployment, start a build manually in Cloudflare or include an intentional `apps/web` change. Expand watch paths later if dependency-driven deployments are desired.

## Credentials and provisioning

Keep all deployment authorization **inside Cloudflare**:

1. Authorize Cloudflare's GitHub App to read this repository. This does not require storing a Cloudflare secret in GitHub.
2. Select a scoped **Cloudflare Builds build token** in the dashboard. It needs Worker deployment, D1 migration permissions and the relevant Custom Domain/route permissions for the intended account/zone. The provider's default generated token does not list D1 access: verify/add the required D1 permission. Limit scope to the production account and `hien.page`; never log/paste the token into commands, source or chat.
3. Provision production D1 `hp-flashcard` and replace **only** `env.production.d1_databases[0].database_id` in `apps/web/wrangler.jsonc`. Keep the top-level placeholder local-only. The release scripts refuse the production placeholder; no automatic database provisioning is intended.
4. Provision the Worker and production secrets **before enabling automatic builds**. Runtime `CLERK_JWT_KEY` and `CLERK_WEBHOOK_SIGNING_SECRET` go into Cloudflare Worker secrets, not build variables or GitHub. Local `.env*` and `.dev.vars*` files must not exist in the release checkout. Ordinary `wrangler secret put` deploys immediately; use the staged `wrangler versions secret` flow when a deployment is not yet authorized.
5. Create the **Flashcard Clerk production instance**. Configure the application/home URL and allowed redirects/origin for `https://flashcard.hien.page`, public email-code sign-up/sign-in, no passwords/social providers, and no self-service deletion. Complete Clerk DNS/certificate verification. Subscribe the production webhook to `user.deleted` at `https://flashcard.hien.page/api/webhooks/clerk`. Do not reuse another application's production instance.
6. Use the existing Cloudflare-managed `hien.page` zone for the Worker Custom Domain `flashcard.hien.page`. Production Wrangler config serves frontend assets and `/api/*` from one Worker, disables `workers.dev` and preview URLs, and sets only the production authorized-party origin. `wrangler deploy --env production` reconciles routes and cron configuration.
7. Leave GitHub CI as checks-only; require its checks before merging to protected main. Cloudflare **does not wait for the separate GitHub push CI run**. A direct push bypassing branch protection can start a Cloudflare build immediately.

If the earlier draft's GitHub secrets/variables or `web-production-lock`/`web-production-watermark` refs were ever created, reconcile outstanding builds before manually removing them. The repository no longer uses them. Do not delete unrelated publishing credentials.

## Build and deployment sequence

`apps/web/scripts/release.mjs` runs entirely inside Cloudflare Builds:

1. Require the Cloudflare main-branch context, matching checkout SHA, production Clerk publishable key, explicit production D1, correct Custom Domain/origin and disabled aliases.
2. Verify every SQL file against its reviewed SHA-256 in `apps/web/release/migrations.json`. The file list must match exactly.
3. During the **build command**, optionally run the reviewed prior-Worker HTTP suite against candidate migrations on disposable **local** D1, build the frontend, and dry-run Worker packaging. Write `dist/release.json` with the commit and build UUID only after success.
4. During the **deploy command**, revalidate the inputs and require that build receipt. Apply production D1 migrations, then run `wrangler deploy --env production`, tagging the version with the commit and message with its Cloudflare build UUID.
5. Check the Custom Domain for a healthy schema-backed `/api/health`, matching serving commit, matching static `release.json` commit/build, frontend HTML and unauthenticated API `401`. Log only build/commit/version identifiers.

Build or migration failure stops subsequent steps. No failure automatically reverses SQL, restores D1 or deploys older code.

### Migration review

Keep historical SQL immutable and use expand-and-contract: additive nullable/defaulted columns and tables first, compatible backfills separately, removals only after the rollback window. A hash is an approval boundary, **not** proof of SQL compatibility.

Update migration hashes and compatibility notes **when migrations change**, not for ordinary app pushes. Set `compatibleWithCommit` to the prior Worker commit used for compatibility testing; it is `null` only for the initial schema with no prior deployed application. `release-compat.mjs` archives that commit, copies candidate migrations into a temporary checkout, installs its locked dependencies without provider credentials, and runs its `web:worker` suite against local D1. Only its own temporary directory is removed afterwards.

Initial local rehearsal:

```sh
node apps/web/scripts/release-compat.mjs verify-baseline <full-main-SHA>
```

### Concurrency and ordering limitation

This native flow intentionally has **no GitHub coordinator, persistent git-ref lock or high-water marker**. Do not assume Cloudflare's account build quota is a production lifecycle lock: paid accounts can run multiple builds. The scripts enforce ordering **within a build**, not across concurrent builds, retries, manual deployments or rollback.

Before enabling production, verify the provider's actual same-Worker queue/cancellation behavior. Do not retry an old build or run a manual deployment/rollback while an automatic build can still deploy. If strict cross-build serialization and stale-release rejection remain required, add a Cloudflare-side coordinator as separate work; this implementation does **not** claim the original #63 concurrency guarantees. No standing staging environment is introduced.

## Failure handling and code-only rollback

1. Inspect the Cloudflare build log for the last successful command, commit and build UUID. Inspect the Worker deployment list and `/api/health` to establish what is actually serving; a failed health request is an unknown state, not proof no deployment occurred.
2. Inspect migration history without exposing user data. Earlier files may remain applied when a later file fails. Keep old code compatible with those migrations.
3. Pause automatic builds and cancel/wait for **all** outstanding builds to terminate before manual intervention. New pushes must not race rollback.
4. For code-only rollback, choose a previously healthy retained version in **Cloudflare → Worker → Deployments → Rollback**, or use the installed Wrangler rollback command from an authorized local terminal with `--env production`. Review compatibility with every migration since that version. Do not rebuild current main as a substitute for the old version.
5. Verify the Custom Domain's serving version/commit, frontend assets and API auth. Record the result, then resume automatic builds. A subsequent main push intentionally deploys main again; merge a forward fix before resuming if needed.

Rollback never applies down-migrations, seeds fixtures, restores D1 or discards newer writes. Database recovery is separate, manual and database-wide, with maintenance/deletion-identity reconciliation (ADR 0005 and the next ticket). Cloudflare retains a bounded version history; older browser tabs may need a reload after code rollback.

## Verification status

- Local release tests cover branch/checkout eligibility, production configuration, migration review hashes, build artifact identity, sequencing and failure stops. Existing Worker tests cover health and local D1 behavior.
- Wrangler 4.160.1 accepts the production configuration and dry-run packaging. The baseline compatibility rehearsal passed 121 HTTP tests on disposable local D1; three live Clerk checks were skipped.
- Cloudflare authentication was renewed. Production D1 `hp-flashcard` was created in EEUR with ID `495f0334-6bd7-4847-9176-ca9332674b15` in account `5f7f25968ee22b7e1719fb064620973b` and recorded only in the production binding. No production migrations were applied.
- The connected Clerk workspace last showed Flashcard with **development only**, not production. The Git connection, native trigger/watch paths, build-token permissions, runtime secrets, domain, live build/deployment, rollback and queue behavior remain **operator verification steps**. No production build or release has been triggered by this work.

Verify push/path behavior and build/migration failures on explicitly authorized disposable resources before enabling production. Verify actual serving identity and disabled aliases through the Custom Domain/provider settings. Source configuration and local tests are not evidence that dashboard setup is complete.

## Provider references

- [Build settings and identity variables](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).
- [Production branch and disabled previews](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/).
- [Build watch paths and exceptions](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/).
- [Build concurrency limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/).
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).
- [Code rollback limitations](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
