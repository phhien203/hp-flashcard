import { createApp } from './app.js'
import { database, forgetExpiredRecords } from './collection.js'
import type { Env } from './env.js'
import { forgetOldDeliveries } from './lifecycle.js'
import { forgetOldWrites } from './rate-limit.js'

const app = createApp()

/**
 * The Flashcard Worker. Wrangler routes /api/* here (run_worker_first) and
 * serves the built frontend for everything else.
 */
export default {
  fetch: app.fetch,
  // The daily cron (wrangler.jsonc): forget expired idempotency records,
  // old webhook delivery ids and rate-limit entries out of their window.
  async scheduled(_controller, env) {
    const db = database(env.DB)
    const now = Date.now()
    await db.batch([
      forgetExpiredRecords(db, now),
      forgetOldDeliveries(db, now),
      forgetOldWrites(db, now),
    ])
  },
} satisfies ExportedHandler<Env>
