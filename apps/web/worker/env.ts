/** The Worker's bindings: wrangler.jsonc, plus secrets and variables. */
export interface Env {
  WORKER_VERSION?: { id: string; tag: string; timestamp: string }
  DB: D1Database
  /**
   * The Clerk instance's PEM public key, for networkless session token
   * verification. Preferred; `CLERK_SECRET_KEY` fetches the keys instead.
   */
  CLERK_JWT_KEY?: string
  CLERK_SECRET_KEY?: string
  /**
   * The origins allowed to have issued a session token (its `azp`),
   * comma-separated, e.g. `http://localhost:5173`. Required.
   */
  CLERK_AUTHORIZED_PARTIES?: string
  /**
   * The signing secret (`whsec_…`) of the Clerk webhook endpoint that
   * delivers `user.deleted` to `/api/webhooks/clerk`. Without it, every
   * delivery is refused (and Clerk retries).
   */
  CLERK_WEBHOOK_SIGNING_SECRET?: string
  /**
   * Set while a database recovery is under way (docs/web-recovery.md): a
   * new value per recovery. The API answers `503` until this epoch is
   * reconciled and reopened. Outside D1, so restoring D1 can't clear it.
   */
  RECOVERY_EPOCH?: string
  /** The operator's bearer token for `/api/recovery/*`, during a recovery. */
  RECOVERY_ADMIN_TOKEN?: string
  /** The Clerk Backend API's origin, for reconciliation. Tests only. */
  CLERK_API_URL?: string
}
