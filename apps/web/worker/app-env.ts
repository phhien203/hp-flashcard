import type { AuthVariables } from './auth.js'
import type { Env } from './env.js'

/** The Hono environment of every route: bindings and per-request values. */
export type AppEnv = {
  Bindings: Env
  Variables: AuthVariables & {
    /** This request's id, in its response and its log records. */
    requestId: string
  }
}
