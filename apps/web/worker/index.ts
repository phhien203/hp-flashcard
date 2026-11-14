import { createApp } from './app.js'
import { database, forgetExpiredRecords } from './collection.js'
import type { Env } from './env.js'

const app = createApp()

/**
 * The Flashcard Worker. Wrangler routes /api/* here (run_worker_first) and
 * serves the built frontend for everything else.
 */
export default {
  fetch: app.fetch,
  // The daily cron (wrangler.jsonc): forget expired idempotency records.
  async scheduled(_controller, env) {
    await forgetExpiredRecords(database(env.DB), Date.now())
  },
} satisfies ExportedHandler<Env>
