import { describe, expect, it } from 'vitest'

import { ApiError } from '../api/client.js'
import type { ApiErrorBody } from '../api/types.js'
import { maintenanceWriteMessage } from '../domain/maintenance.js'
import { rateLimitedMessage } from '../domain/rate-limit.js'
import {
  cardSaveFailure,
  deleteFailureMessage,
  OFFLINE_MESSAGE,
  progressSaveFailure,
} from './write-failures.js'

const apiError = (
  status: number,
  code: ApiErrorBody['code'],
  extra: Partial<ApiErrorBody> = {},
  retryAfter?: number,
) => new ApiError(status, { code, message: code, ...extra }, retryAfter)

const offline = new TypeError('Failed to fetch')
const unexpected = new Error('boom')

describe('cardSaveFailure', () => {
  it('shows validation errors beside the Card fields they are about', () => {
    const failure = cardSaveFailure(
      apiError(400, 'validation_failed', {
        fieldErrors: { question: 'Too long.', category: 'Blank.' },
      }),
    )

    expect(failure).toEqual({
      fieldErrors: { question: 'Too long.', category: 'Blank.' },
      message: undefined,
    })
  })

  it('explains a validation error about another field for the whole form', () => {
    const failure = cardSaveFailure(
      apiError(400, 'validation_failed', {
        fieldErrors: { question: 'Too long.', progress: 'Out of range.' },
      }),
    )

    expect(failure).toEqual({
      fieldErrors: {},
      message: 'Your card could not be saved. Please try again.',
    })
  })

  it.each([
    [
      apiError(404, 'not_found'),
      'This card no longer exists, so it could not be saved.',
    ],
    [
      apiError(401, 'unauthorized'),
      'Your session has ended. Sign in again to save your card.',
    ],
    [
      apiError(409, 'quota_exceeded'),
      'You have reached the limit of 1,000 cards. Delete a card to make room for a new one.',
    ],
    [apiError(503, 'maintenance'), maintenanceWriteMessage('saved')],
    [apiError(429, 'rate_limited', {}, 7), rateLimitedMessage(7)],
    [offline, OFFLINE_MESSAGE],
    [unexpected, 'Your card could not be saved. Please try again.'],
  ])('explains %o for the whole form', (error, message) => {
    expect(cardSaveFailure(error)).toEqual({ fieldErrors: {}, message })
  })
})

describe('deleteFailureMessage', () => {
  it.each([
    [
      offline,
      'Your card could not be deleted: you’re offline or the server can’t be reached. Check your connection and try again.',
    ],
    [
      apiError(401, 'unauthorized'),
      'Your session has ended. Sign in again to delete your card.',
    ],
    [apiError(429, 'rate_limited'), rateLimitedMessage(undefined)],
    [apiError(503, 'maintenance'), maintenanceWriteMessage('deleted')],
    [
      apiError(500, 'server_error'),
      'Your card could not be deleted. Please try again.',
    ],
  ])('explains %o', (error, message) => {
    expect(deleteFailureMessage(error)).toBe(message)
  })
})

describe('progressSaveFailure', () => {
  it('asks the person to decide again after a conflict, without Retry', () => {
    expect(progressSaveFailure(apiError(409, 'version_conflict'))).toEqual({
      title: 'This card’s progress was changed on another device.',
      description:
        'It now shows the latest progress. Study it again if you like.',
      retry: false,
    })
  })

  it('offers no Retry for a deleted Card or an ended session', () => {
    expect(progressSaveFailure(apiError(404, 'not_found')).retry).toBe(false)
    expect(progressSaveFailure(apiError(401, 'unauthorized')).retry).toBe(false)
  })

  it.each([
    [apiError(429, 'rate_limited', {}, 1), rateLimitedMessage(1)],
    [
      offline,
      'You’re offline or the server can’t be reached. Check your connection and try again.',
    ],
    [unexpected, 'The card keeps its previous progress.'],
  ])('offers Retry after %o', (error, description) => {
    expect(progressSaveFailure(error)).toEqual({
      title: 'Your progress could not be saved.',
      description,
      retry: true,
    })
  })
})
