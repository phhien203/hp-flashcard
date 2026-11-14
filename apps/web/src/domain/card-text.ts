/**
 * The rules for a Card's text, shared by the app's forms, the mock backend
 * and the Worker, so all three accept and reject exactly the same input.
 *
 * - **Trimming** uses `String.prototype.trim()`: ECMAScript white space and
 *   line terminators (spaces, tabs, newlines, no-break spaces, U+FEFF,
 *   U+2028/U+2029 and the other Unicode `Space_Separator`s) at either end.
 * - **Length** is counted after trimming, in Unicode code points: "é" (one
 *   code point), "😀" (one code point, two UTF-16 units) and "é" (two
 *   code points) count 1, 1 and 2. It matches SQLite's `length()` on text,
 *   which the database's own checks use, and JSON Schema's `maxLength`.
 * - Text must be **well-formed** UTF-16: a lone surrogate is rejected, as it
 *   could not be stored faithfully.
 * - Text is stored as given (after trimming): no Unicode normalization.
 * - **Category names** are equivalent when their trimmed, lower-cased
 *   (`String.prototype.toLowerCase()`, locale-independent) forms are equal.
 */

export interface CardText {
  question: string
  answer: string
  category: string
}

export type CardTextField = keyof CardText

export const CARD_TEXT_FIELDS = ['question', 'answer', 'category'] as const

/** The most characters (code points) each field may hold, after trimming. */
export const MAX_LENGTHS: Record<CardTextField, number> = {
  question: 2000,
  answer: 10000,
  category: 100,
}

/** The most Cards one Collection may hold. */
export const CARD_QUOTA = 1000

/** Messages keyed by the field they are about. */
export type CardTextErrors = Partial<Record<CardTextField, string>>

const LABELS: Record<CardTextField, string> = {
  question: 'Questions',
  answer: 'Answers',
  category: 'Category names',
}

/** The message for a blank field. */
export const BLANK_MESSAGES: Record<CardTextField, string> = {
  question: 'Please enter a question.',
  answer: 'Please enter an answer.',
  category: 'Please enter a category.',
}

/** The message for a field over its maximum length. */
export const tooLongMessage = (field: CardTextField) =>
  `${LABELS[field]} can be at most ${MAX_LENGTHS[field].toLocaleString('en-US')} characters.`

export const INVALID_TEXT_MESSAGE =
  'This contains characters that can’t be saved.'

/** How many characters `text` holds: its Unicode code points. */
export const characterCount = (text: string) => Array.from(text).length

/** Whether `text` has no lone surrogates. */
const isWellFormed = (text: string) =>
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
    text,
  )

/** Why one trimmed field value is unacceptable, or `undefined`. */
export function fieldError(field: CardTextField, trimmed: string) {
  if (!trimmed) return BLANK_MESSAGES[field]
  if (!isWellFormed(trimmed)) return INVALID_TEXT_MESSAGE
  if (characterCount(trimmed) > MAX_LENGTHS[field]) return tooLongMessage(field)
  return undefined
}

/**
 * Trims the given fields and checks them: the trimmed values, or why they
 * can't be saved. Absent fields are neither checked nor returned.
 */
export function checkCardText<T extends Partial<CardText>>(
  fields: T,
): { ok: true; value: T } | { ok: false; errors: CardTextErrors } {
  const value: Partial<CardText> = {}
  const errors: CardTextErrors = {}
  for (const field of CARD_TEXT_FIELDS) {
    const raw = fields[field]
    if (raw === undefined) continue
    value[field] = raw.trim()
    const error = fieldError(field, value[field])
    if (error) errors[field] = error
  }
  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, value: value as T }
}

/** The key under which equivalent Category names match. */
export const categoryKey = (name: string) => name.trim().toLowerCase()
