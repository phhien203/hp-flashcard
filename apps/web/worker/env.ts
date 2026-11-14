/** The Worker's bindings: wrangler.jsonc, plus secrets and variables. */
export interface Env {
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
}
