/**
 * Structured logging for Workers Logs (wrangler.jsonc `observability`).
 * Records are JSON objects of plain, sanitized fields: request ids, route
 * patterns, statuses, latencies, event types and error class names. Never
 * Card text, emails, tokens, request bodies or error messages.
 */
export type LogField = string | number | boolean | null | undefined

export type Log = (
  level: 'info' | 'error',
  record: Record<string, LogField>,
) => void

/** Logs as Workers Logs indexes them: one JSON object per line. */
export const consoleLog: Log = (level, record) => {
  const line = JSON.stringify(record)
  if (level === 'error') console.error(line)
  else console.log(line)
}
