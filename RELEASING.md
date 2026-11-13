# Releasing

Releases use [Changesets](https://github.com/changesets/changesets) and `.github/workflows/release.yml`, with manual npm approval before a version goes live.

1. Each PR that changes `@hp-flashcard/ui` adds a changeset (`pnpm changeset`).
2. On every push to `main`, the Release workflow opens or updates a **"chore: version packages"** PR. The PR bumps versions and writes `CHANGELOG.md` from the pending changesets.
3. Merging that PR builds and **stages** the package, with provenance, through **npm trusted publishing (OIDC)**. No `NPM_TOKEN` secret is needed. Already published versions are skipped; registry errors fail the workflow rather than being treated as missing versions.
4. A maintainer reviews the staged contents and approves with **2FA** on npmjs.com (the **Staged Packages** tab). Only then does the version become publicly installable.
5. Git tags and GitHub releases are not created automatically. After approval, create them from the commit that produced the staged package, using the tag `@hp-flashcard/ui@<version>` and its changelog.

## Review and approve

Use npm CLI **11.15.0 or later** and Node **22.14.0 or later** (CI uses Node 24). With an interactive npm login:

```sh
npm login
npm stage list @hp-flashcard/ui
npm stage view <stage-id>
npm stage download <stage-id>
# Inspect the downloaded contents before approving.
npm stage approve <stage-id>
```

Approval requires 2FA. To discard a candidate, use `npm stage reject <stage-id>` instead.

The release script packs with `pnpm pack` first so `catalog:` dependency references become real versions, then stages that tarball using npm. To validate packaging locally without staging anything, run `pnpm release --dry-run --provenance=false`.

Staged versions reserve their version number. A subsequent push or rerun before approval may fail because that version is already staged; this is not permission to publish directly. Review and approve the existing candidate, or reject it before staging a replacement. CI cannot list or approve staged packages with its OIDC credentials. After rejection, use **Actions → Release → Run workflow** on `main` to restage, provided `main` still contains the intended version and contents.

## One-time setup (manual: only the repo owner can do these)

### GitHub

1. Create the repo `phhien203/hp-flashcard`, then push:
   ```sh
   git remote add origin git@github.com:phhien203/hp-flashcard.git
   git push -u origin main
   ```
2. **Settings → Actions → General → Workflow permissions:** turn on _"Allow GitHub Actions to create and approve pull requests"_. The Version PR needs it.
3. **Settings → Pages → Source:** _GitHub Actions_. Storybook deploys to `https://phhien203.github.io/hp-flashcard/`.
4. Install the [Renovate GitHub App](https://github.com/apps/renovate) on the repo. For automerge to work, protect `main` and require the CI checks.

### npm

1. Create the npm organization **`hp-flashcard`** at https://www.npmjs.com/org/create. The free plan is enough for public packages.
2. If the package does not exist yet, **stage** the first version interactively to create npm's public `0.0.0-stage` placeholder without publishing the real contents:
   ```sh
    npm login
    pnpm release --provenance=false
   ```
   Review and approve this first candidate with 2FA, or reject it before letting CI stage the same version with provenance. Do not directly publish as a bootstrap workaround.
3. On npmjs.com, go to **@hp-flashcard/ui → Settings → Trusted publishing → GitHub Actions** and enter:
   - Organization or user: `phhien203`
   - Repository: `hp-flashcard`
   - Workflow filename: `release.yml`
   - Environment: leave empty
   - Allowed actions: stage publishing only; **disable direct `npm publish` and dist-tag management**
4. In the same settings page, set _"Require two-factor authentication and disallow tokens"_. Revoke any old publish tokens that bypass 2FA. Stage-only CI permissions do not prevent a separate credential from bypassing the review gate.

Verify on the first automated release that `npm stage publish` authenticates through OIDC and leaves the candidate awaiting approval. Don't fall back to direct publishing or a long-lived `NPM_TOKEN`.
