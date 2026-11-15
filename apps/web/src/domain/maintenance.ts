/**
 * The API's answer while a database recovery is under way (ADR 0005):
 * `503` with `maintenance`. Nothing was read or written, so nothing the
 * request carried was saved.
 */
export const MAINTENANCE_MESSAGE =
  'Flashcard is down for maintenance. Nothing was changed. Try again later.'

/** The `Retry-After` of a maintenance answer, in seconds. */
export const MAINTENANCE_RETRY_AFTER_SECONDS = 300

/** What the app says about a write refused for maintenance. */
export const maintenanceWriteMessage = (refused: 'saved' | 'deleted') =>
  `Flashcard is down for maintenance, so your card was not ${refused}. Try again in a few minutes.`

/** What the app says when it can't load anything for maintenance. */
export const MAINTENANCE_NOTICE = {
  title: 'Flashcard is down for maintenance.',
  description:
    'Your cards can’t be loaded or changed right now. Try again in a few minutes.',
}
