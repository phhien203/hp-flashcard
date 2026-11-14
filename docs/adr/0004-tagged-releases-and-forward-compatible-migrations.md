# Release tagged commits with forward-compatible migrations

With only local and production environments, releases must be deliberate and database changes must not break the currently running Worker. Tags matching `web-v*` trigger GitHub Actions checks followed by a Cloudflare Build for the exact tagged commit, keeping application releases distinct from UI-package release tags.

## Release constraints

- Release commits must belong to `main`; do not deploy arbitrary branch commits.
- Serialize production releases, including migrations and deployment completion. Prevent an older release from overtaking a newer one; serialization alone does not establish release ordering.
- Disable automatic branch deployments. A GitHub Actions bridge triggers Cloudflare Builds only after required checks pass.
- Build before applying production migrations, then apply reviewed backward-compatible migrations and deploy. Revalidate the exact-commit Cloudflare Builds integration during implementation.
- Use additive/expand-and-contract migrations so the old Worker continues to function if a new deployment fails.
- Roll back Worker code only after deployment failure; do not automatically reverse migrations or restore D1.
- Run production health checks through `flashcard.hien.page`; preview URLs are deliberately unavailable.
- Use non-interactive CI credentials with appropriately scoped access. Keep provisioning and credential setup explicit rather than implying they are already configured.
