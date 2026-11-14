import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { IDEMPOTENCY_KEY_HEADER } from '../src/domain/idempotency.js'
import { ifMatch, IF_MATCH_HEADER } from '../src/domain/versions.js'
import { createApp, REQUEST_ID_HEADER } from './app.js'
import type { Env } from './env.js'
import { consoleLog } from './log.js'
import {
  APP_ORIGIN,
  createIssuer,
  createWebhookSender,
  startWorker,
  type Issuer,
  type TestWorker,
  type WebhookSender,
} from './test/harness.js'

/*
 * What the Worker logs (ADR 0005, Observability): request ids, route
 * patterns, statuses, latency and error kinds, never Card text, emails,
 * credentials, tokens, request bodies or what an exception's message
 * quotes. The app runs here in Node, on the local D1 of the Worker under
 * test, with its log records collected instead of printed.
 */

let issuer: Issuer
let webhooks: WebhookSender
let worker: TestWorker
let env: Env

beforeAll(async () => {
  issuer = createIssuer()
  webhooks = createWebhookSender()
  worker = await startWorker({ issuer, webhooks })
  env = {
    DB: (await worker.env()).DB,
    CLERK_JWT_KEY: issuer.jwtKey,
    CLERK_AUTHORIZED_PARTIES: APP_ORIGIN,
    CLERK_WEBHOOK_SIGNING_SECRET: webhooks.secret,
  }
})
afterAll(() => worker?.dispose())

/** Private values that must never reach a log. */
const SECRET = {
  question: 'Private question 7f3a?',
  answer: 'Private answer 9c1e.',
  category: 'Private category 2b8d',
  email: 'someone.private@example.com',
  password: 'hunter2-private',
}

/** The app, logging into an array, on `db` (the real local D1 by default). */
function loggedApp(db?: D1Database) {
  const records: Record<string, unknown>[] = []
  const app = createApp({
    log: (level, record) => records.push({ level, ...record }),
  })
  const send = (path: string, init: RequestInit = {}) =>
    app.request(`${APP_ORIGIN}${path}`, init, { ...env, DB: db ?? env.DB })
  return { records, send }
}

/** Asserts no record mentions any of `values`. */
function expectNoneOf(
  records: readonly Record<string, unknown>[],
  values: readonly string[],
) {
  const text = JSON.stringify(records)
  for (const value of values) expect(text).not.toContain(value)
}

describe('request logs', () => {
  it('record the request id, route pattern, status and latency, and nothing private', async () => {
    const { records, send } = loggedApp()
    const userId = `user_log_${crypto.randomUUID()}`
    const token = issuer.sessionToken({ sub: userId })
    const auth = { Authorization: `Bearer ${token}` }
    const write = (version?: number) => ({
      ...auth,
      'Content-Type': 'application/json',
      [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID(),
      ...(version ? { [IF_MATCH_HEADER]: ifMatch(version) } : {}),
    })

    const created = await send('/api/cards', {
      method: 'POST',
      headers: write(),
      body: JSON.stringify({
        question: SECRET.question,
        answer: SECRET.answer,
        category: SECRET.category,
      }),
    })
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }
    // Validation failures, whose messages could quote what was sent.
    const invalid = await send(`/api/cards/${id}`, {
      method: 'PATCH',
      headers: write(1),
      body: JSON.stringify({
        answer: SECRET.answer.repeat(1000),
        [SECRET.email]: SECRET.password,
      }),
    })
    expect(invalid.status).toBe(400)
    expect(
      (
        await send(`/api/cards/${id}/progress`, {
          method: 'PUT',
          headers: write(1),
          body: JSON.stringify({ progress: 1 }),
        })
      ).status,
    ).toBe(200)
    expect((await send(`/api/cards/${id}`, { headers: auth })).status).toBe(200)
    // Authentication failures, whose tokens must stay out of the logs.
    for (const authorization of [
      `Bearer ${SECRET.password}`,
      `Bearer ${createIssuer().sessionToken({ sub: userId })}`,
      `Basic ${btoa(`${SECRET.email}:${SECRET.password}`)}`,
    ]) {
      const refused = await send('/api/cards', {
        headers: { Authorization: authorization },
      })
      expect(refused.status).toBe(401)
    }

    const requests = records.filter((r) => r.event === 'request')
    expect(requests.map((r) => [r.method, r.route, r.status])).toEqual([
      ['POST', '/api/cards', 201],
      ['PATCH', '/api/cards/:cardId', 400],
      ['PUT', '/api/cards/:cardId/progress', 200],
      ['GET', '/api/cards/:cardId', 200],
      ['GET', '/api/cards', 401],
      ['GET', '/api/cards', 401],
      ['GET', '/api/cards', 401],
    ])
    for (const record of requests) {
      expect(record).toEqual({
        level: 'info',
        event: 'request',
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        ray: null,
        method: expect.any(String),
        route: expect.any(String),
        status: expect.any(Number),
        durationMs: expect.any(Number),
      })
    }
    // The id a response carries is its record's.
    expect(created.headers.get(REQUEST_ID_HEADER)).toBe(requests[0]!.requestId)
    expectNoneOf(records, [
      ...Object.values(SECRET),
      token,
      userId,
      id,
      btoa(`${SECRET.email}:${SECRET.password}`),
    ])
  })
})

describe('webhook logs', () => {
  it('record event types and outcomes, never identities or emails', async () => {
    const { records, send } = loggedApp()
    const userId = `user_log_${crypto.randomUUID()}`
    const deliver = (body: string, headers = webhooks.headers(body)) =>
      send('/api/webhooks/clerk', { method: 'POST', headers, body })
    const updated = JSON.stringify({
      type: 'user.updated',
      data: { id: userId, email_addresses: [{ email_address: SECRET.email }] },
    })
    const deleted = JSON.stringify({
      type: 'user.deleted',
      data: { id: userId, deleted: true },
    })

    expect((await deliver(updated)).status).toBe(200)
    expect(
      (await deliver(deleted, createWebhookSender().headers(deleted))).status,
    ).toBe(400)
    const purged = await deliver(deleted)
    expect(purged.status).toBe(200)

    expect(
      records
        .filter((r) => r.event !== 'request')
        .map(({ event, type, outcome }) => ({ event, type, outcome })),
    ).toEqual([
      { event: 'webhook', type: 'user.updated', outcome: 'ignored' },
      { event: 'webhook_rejected', type: undefined, outcome: undefined },
      { event: 'webhook', type: 'user.deleted', outcome: 'purged' },
    ])
    expectNoneOf(records, [
      SECRET.email,
      userId,
      webhooks.secret,
      webhooks.headers(deleted)['svix-signature'].slice(3),
    ])
  })

  it('refuses every delivery, and says so, without a signing secret', async () => {
    const records: Record<string, unknown>[] = []
    const app = createApp({ log: (level, r) => records.push({ level, ...r }) })
    const body = JSON.stringify({
      type: 'user.deleted',
      data: { id: 'user_x' },
    })
    const response = await app.request(
      `${APP_ORIGIN}/api/webhooks/clerk`,
      { method: 'POST', headers: webhooks.headers(body), body },
      { ...env, CLERK_WEBHOOK_SIGNING_SECRET: undefined },
    )
    expect(response.status).toBe(500)
    expect(records.map((r) => r.event)).toEqual([
      'webhook_misconfigured',
      'request',
    ])
  })
})

describe('unexpected errors', () => {
  it('log the error kind, never its message', async () => {
    // A database whose failures quote stored and sent values, as SQLite's
    // constraint messages can.
    const failing = new Proxy(env.DB, {
      get(target, property, receiver) {
        if (property === 'batch')
          return () =>
            Promise.reject(
              new Error(
                `D1_ERROR: CHECK constraint failed: ${SECRET.question} ${SECRET.email}`,
              ),
            )
        const value: unknown = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const { records, send } = loggedApp(failing)
    const token = issuer.sessionToken({
      sub: `user_log_${crypto.randomUUID()}`,
    })

    const response = await send('/api/cards', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID(),
      },
      body: JSON.stringify({
        question: SECRET.question,
        answer: SECRET.answer,
        category: SECRET.category,
      }),
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      code: 'server_error',
      message: 'The server failed.',
    })
    expect(records).toEqual([
      {
        level: 'error',
        event: 'api_error',
        requestId: expect.any(String),
        method: 'POST',
        route: '/api/cards',
        error: 'Error',
      },
      expect.objectContaining({
        level: 'error',
        event: 'request',
        status: 500,
      }),
    ])
    expectNoneOf(records, [...Object.values(SECRET), token])
  })
})

describe('the console log', () => {
  it('writes one JSON object per line, errors to the error stream', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      consoleLog('info', { event: 'request', status: 200 })
      consoleLog('error', { event: 'api_error', error: 'TypeError' })
      expect(log).toHaveBeenCalledWith('{"event":"request","status":200}')
      expect(error).toHaveBeenCalledWith(
        '{"event":"api_error","error":"TypeError"}',
      )
    } finally {
      log.mockRestore()
      error.mockRestore()
    }
  })
})
