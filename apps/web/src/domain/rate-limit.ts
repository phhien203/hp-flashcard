/**
 * The write rate limit (ADR 0002): each account may make at most
 * `WRITE_LIMIT` write requests (creations, edits, deletions and Progress
 * saves) in any `WRITE_WINDOW_MS` window, a sliding window counted across
 * every Worker instance. Every write request the API accepts counts,
 * whatever it answers, retries included: a retry is a request too. A
 * request refused with `429` doesn't count, so waiting `Retry-After`
 * seconds and sending it again (with the same idempotency key) is safe.
 */
export const WRITE_LIMIT = 60

export const WRITE_WINDOW_MS = 60_000

/** The `429` response's header: whole seconds to wait. */
export const RETRY_AFTER_HEADER = 'Retry-After'

/** What a person is told after a `429`, waiting `seconds`. */
export const rateLimitedMessage = (seconds: number | undefined) =>
  seconds === undefined
    ? 'You’re making changes too quickly. Wait a moment, then try again.'
    : `You’re making changes too quickly. Wait ${seconds} ${seconds === 1 ? 'second' : 'seconds'}, then try again.`
