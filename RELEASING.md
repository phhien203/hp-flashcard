# Releasing

Releases are automated with [Changesets](https://github.com/changesets/changesets) and `.github/workflows/release.yml`.

1. Each PR that changes `@hp-flashcard/ui` adds a changeset (`pnpm changeset`).
2. On every push to `main`, the Release workflow opens or updates a **"chore: version packages"** PR. The PR bumps versions and writes `CHANGELOG.md` from the pending changesets.
3. Merging that PR publishes to npm, with provenance, through **npm trusted publishing (OIDC)**. No `NPM_TOKEN` secret is needed. The workflow also pushes git tags and creates GitHub releases.

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
2. Trusted publishing can only be configured on a package that already exists, so do the **first publish by hand**:
   ```sh
   npm login
   pnpm build
   cd packages/ui && pnpm publish --access public --no-provenance
   ```
   (Optional: publish a `0.0.0` placeholder before the first real version.)
3. On npmjs.com, go to **@hp-flashcard/ui → Settings → Trusted publishing → GitHub Actions** and enter:
   - Organization or user: `phhien203`
   - Repository: `hp-flashcard`
   - Workflow filename: `release.yml`
   - Environment: leave empty
4. Optional hardening: in the same settings page, set _"Require two-factor authentication and disallow tokens"_.

Verify on the first automated release that `pnpm publish` authenticates through OIDC. If your pnpm version can't, change `publish-script` in `release.yml` to `pnpm build && npx changeset publish` with npm ≥ 11.5.1 available. Don't fall back to a long-lived `NPM_TOKEN`.
