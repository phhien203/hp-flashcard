import { defineConfig } from 'drizzle-kit'

// `pnpm --filter @hp-flashcard/web db:generate` writes reviewed SQL
// migrations to migrations/, which Wrangler applies (wrangler.jsonc's
// migrations_dir). Never push schema changes to a database directly.
export default defineConfig({
  dialect: 'sqlite',
  schema: './worker/db/schema.ts',
  out: './migrations',
})
