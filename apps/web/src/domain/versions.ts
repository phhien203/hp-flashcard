/**
 * Optimistic concurrency for Cards (ADR 0003), with two independent
 * versions. A Card's `contentVersion` covers its question, answer and
 * Category: an edit or deletion names it. Its `progressVersion` covers its
 * Progress: a Progress save names it. Each write names its version in
 * `If-Match`, as a quoted entity tag (`"3"`), and is refused with `409`
 * when that version has moved on; a write to one never moves the other.
 */
export const IF_MATCH_HEADER = 'If-Match'

/** The two versions a Card carries. */
export type VersionName = 'contentVersion' | 'progressVersion'

/** How to send `version` in `If-Match`. */
export const ifMatchMessage = (version: VersionName) =>
  `Send the Card’s ${version} as a quoted number, e.g. "3".`

/** The `If-Match` value naming `contentVersion`. */
export const ifMatch = (contentVersion: number) => `"${contentVersion}"`

/** The content version an `If-Match` value names, or `undefined`. */
export function parseIfMatch(value: string | null | undefined) {
  const digits = /^"([1-9][0-9]{0,15})"$/.exec(value ?? '')?.[1]
  if (digits === undefined) return undefined
  const version = Number(digits)
  return Number.isSafeInteger(version) ? version : undefined
}
