import { ApiError } from '../api/client.js'
import {
  CARD_QUOTA,
  CARD_TEXT_FIELDS,
  type CardTextErrors,
  type CardTextField,
} from '../domain/card-text.js'
import { maintenanceWriteMessage } from '../domain/maintenance.js'
import { rateLimitedMessage } from '../domain/rate-limit.js'

/*
 * How a failed request is classified, and how a failed write is explained
 * to the person who made it. Plain functions, free of React and Query, so
 * every page and dialog explains the same failure the same way.
 */

/** Whether a failed write found no such Card: it was already deleted. */
export const isNotFound = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 404

/** Whether a write was refused by the write rate limit (`429`). */
export const isRateLimited = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 429

/**
 * Whether a request was refused because a database recovery has the API
 * closed (`503`): nothing was read or written.
 */
export const isMaintenance = (error: unknown): error is ApiError =>
  error instanceof ApiError &&
  error.status === 503 &&
  error.body?.code === 'maintenance'

/** Whether a failed write found the Card changed since its version. */
export const isConflict = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.body?.code === 'version_conflict'

/** Whether the session ended before the request (`401`). */
export const isUnauthorized = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 401

/**
 * Whether a write failed for want of a connection: `fetch` rejects with a
 * `TypeError` when no response arrives, and nothing is queued for later.
 */
export const isNetworkFailure = (error: unknown) =>
  error instanceof TypeError ||
  (typeof navigator !== 'undefined' && navigator.onLine === false)

/** Why a write that never got an answer failed: no connection. */
export const OFFLINE_MESSAGE =
  'Your card could not be saved: you’re offline or the server can’t be reached. Check your connection and try again.'

const isCardField = (field: string): field is CardTextField =>
  (CARD_TEXT_FIELDS as readonly string[]).includes(field)

/** Field errors the form can show, or `undefined` if any belong elsewhere. */
function cardFieldErrors(error: ApiError): CardTextErrors | undefined {
  const entries = Object.entries(error.body?.fieldErrors ?? {})
  if (entries.length === 0) return undefined
  const fieldErrors: CardTextErrors = {}
  for (const [field, message] of entries) {
    if (!isCardField(field)) return undefined
    fieldErrors[field] = message
  }
  return fieldErrors
}

/** How a failed Card save (create or edit) is explained. */
export interface CardSaveFailure {
  /** Shown beside the fields they are about. */
  fieldErrors: CardTextErrors
  /** Shown for the whole form, when the failure isn't about one field. */
  message: string | undefined
}

/** How a failed save is explained: beside fields, or for the whole form. */
export function cardSaveFailure(error: unknown): CardSaveFailure {
  const formMessage = (message: string) => ({ fieldErrors: {}, message })
  if (error instanceof ApiError && error.status === 400) {
    const fieldErrors = cardFieldErrors(error)
    if (fieldErrors) return { fieldErrors, message: undefined }
  }
  if (isNotFound(error))
    return formMessage('This card no longer exists, so it could not be saved.')
  if (isUnauthorized(error))
    return formMessage(
      'Your session has ended. Sign in again to save your card.',
    )
  if (error instanceof ApiError && error.body?.code === 'quota_exceeded')
    return formMessage(
      `You have reached the limit of ${CARD_QUOTA.toLocaleString('en-US')} cards. Delete a card to make room for a new one.`,
    )
  if (isMaintenance(error)) return formMessage(maintenanceWriteMessage('saved'))
  if (isRateLimited(error))
    return formMessage(rateLimitedMessage(error.retryAfter))
  if (isNetworkFailure(error)) return formMessage(OFFLINE_MESSAGE)
  return formMessage('Your card could not be saved. Please try again.')
}

/**
 * What the delete dialog says about a failed deletion. A conflict and a
 * Card that is already gone are handled by the dialog, not explained here.
 */
export function deleteFailureMessage(error: unknown): string {
  if (isNetworkFailure(error))
    return 'Your card could not be deleted: you’re offline or the server can’t be reached. Check your connection and try again.'
  if (isUnauthorized(error))
    return 'Your session has ended. Sign in again to delete your card.'
  if (isRateLimited(error)) return rateLimitedMessage(error.retryAfter)
  if (isMaintenance(error)) return maintenanceWriteMessage('deleted')
  return 'Your card could not be deleted. Please try again.'
}

/** How a failed Progress save is explained, and whether Retry can help. */
export interface ProgressSaveFailure {
  title: string
  description: string
  retry: boolean
}

const PROGRESS_NOT_SAVED = 'Your progress could not be saved.'

/**
 * How a failed Progress save is explained, and whether sending it again
 * can help. After a conflict or a deleted Card, the screen already shows
 * the Card as it is now: the person decides again rather than retrying.
 */
export function progressSaveFailure(error: unknown): ProgressSaveFailure {
  if (isConflict(error))
    return {
      title: 'This card’s progress was changed on another device.',
      description:
        'It now shows the latest progress. Study it again if you like.',
      retry: false,
    }
  if (isNotFound(error))
    return {
      title: 'This card no longer exists.',
      description: 'It was deleted on another device.',
      retry: false,
    }
  if (isRateLimited(error))
    return {
      title: PROGRESS_NOT_SAVED,
      description: rateLimitedMessage(error.retryAfter),
      retry: true,
    }
  if (isMaintenance(error))
    return {
      title: PROGRESS_NOT_SAVED,
      description:
        'Flashcard is down for maintenance. The card keeps its previous progress; try again in a few minutes.',
      retry: true,
    }
  if (isUnauthorized(error))
    return {
      title: PROGRESS_NOT_SAVED,
      description: 'Your session has ended. Sign in again to save it.',
      retry: false,
    }
  if (isNetworkFailure(error))
    return {
      title: PROGRESS_NOT_SAVED,
      description:
        'You’re offline or the server can’t be reached. Check your connection and try again.',
      retry: true,
    }
  return {
    title: PROGRESS_NOT_SAVED,
    description: 'The card keeps its previous progress.',
    retry: true,
  }
}
