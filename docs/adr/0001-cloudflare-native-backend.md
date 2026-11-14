# Use an explicit Cloudflare-native backend

The existing React/Vite frontend needs durable storage without a frontend rewrite or server administration. Use a single Cloudflare Worker with Hono, D1, Drizzle ORM, and Wrangler, serving both frontend static assets and the existing `/api/*` REST endpoints. Keep OpenAPI as the API source of truth and retain TanStack Query rather than introducing framework-specific loaders or RPC.

Void was considered for integrated resource management and deployment but rejected for now: its broader full-stack abstractions overlap with the existing frontend and independently chosen authentication and API contract. Explicit Cloudflare configuration requires more wiring but keeps the integration layers independently understandable.

## Boundaries

- Local development and production only; no persistent staging environment.
- Production is exclusively `https://flashcard.hien.page`, a Worker Custom Domain under the existing Cloudflare-managed `hien.page` zone.
- Disable public `workers.dev` and deployment preview URLs. Deployment health checks must work through the custom domain.
- Keep checked-in, reviewed SQL migrations generated through Drizzle Kit; do not push schema changes directly to production.
- Preserve existing Card CRUD, Category matching/counts, statistics, filtering, offset pagination, and deterministic seeded ordering.
- Deliver frontend authentication and real API integration as part of the backend work. MSW remains for tests and explicit mock development, not unconditional production startup.
