/**
 * Optimistic concurrency for Card content (ADR 0003). Every Card carries a
 * `contentVersion`; an edit or deletion names the version it was based on
 * in `If-Match`, as a quoted entity tag (`"3"`), and is refused with `409`
 * when the Card has moved on.
 */
export const IF_MATCH_HEADER = 'If-Match'

export const IF_MATCH_MESSAGE =
  'Send the Card’s contentVersion as a quoted number, e.g. "3".'

/** The `If-Match` value naming `contentVersion`. */
export const ifMatch = (contentVersion: number) => `"${contentVersion}"`

/** The content version an `If-Match` value names, or `undefined`. */
export function parseIfMatch(value: string | null | undefined) {
  const digits = /^"([1-9][0-9]{0,15})"$/.exec(value ?? '')?.[1]
  if (digits === undefined) return undefined
  const version = Number(digits)
  return Number.isSafeInteger(version) ? version : undefined
}
