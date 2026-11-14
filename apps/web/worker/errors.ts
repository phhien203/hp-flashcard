import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import type { components } from '../src/api/schema.js'

type ErrorBody = components['schemas']['Error']

/** Answers with the contract's error body. */
export const apiError = (
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorBody['code'],
  message: string,
  fieldErrors?: Record<string, string>,
) =>
  c.json<ErrorBody>(
    fieldErrors ? { code, message, fieldErrors } : { code, message },
    status,
  )
