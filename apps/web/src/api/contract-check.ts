import { fileURLToPath } from 'node:url'

import { dereference } from '@readme/openapi-parser'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { expect } from 'vitest'

import { SPEC_URL } from '../../scripts/api-types.ts'

export const SPEC_PATH = fileURLToPath(SPEC_URL.href)

export type Method = 'get' | 'post' | 'patch' | 'put' | 'delete'

/** Sends a request to the backend under test: MSW, or the Worker. */
export type Send = (path: string, init: RequestInit) => Promise<Response>

export interface ConformsOptions {
  body?: unknown
  headers?: Record<string, string>
}

/**
 * A checker for one backend: `expectConforms` sends a request, then checks
 * the request body, the status and the response body against
 * api/openapi.yaml, and returns the response body and headers. For tests,
 * in Node.
 */
export async function contractChecker(send: Send) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spec: any = await dereference(SPEC_PATH)
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats.default(ajv)

  return async function expectConforms(
    method: Method,
    pathTemplate: string,
    path: string,
    status: number,
    { body: requestBody, headers = {} }: ConformsOptions = {},
  ): Promise<{ body: unknown; headers: Headers }> {
    const operation = spec.paths[pathTemplate][method]
    expect(
      operation,
      `${method} ${pathTemplate} is not documented`,
    ).toBeDefined()
    if (requestBody !== undefined && status < 400) {
      const checkRequest = ajv.compile(
        operation.requestBody.content['application/json'].schema,
      )
      expect(
        checkRequest(requestBody) ? [] : checkRequest.errors,
        'the request body breaks the contract',
      ).toEqual([])
    }
    const response = await send(path, {
      method: method.toUpperCase(),
      headers: {
        ...(requestBody === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    })
    const definition = operation.responses[String(status)]
    expect(definition, `${status} is not documented`).toBeDefined()
    if (!definition.content) {
      expect(response.status).toBe(status)
      // No content: the response must have no body.
      expect(await response.text()).toBe('')
      return { body: undefined, headers: response.headers }
    }
    const text = await response.text()
    expect(response.status, text).toBe(status)
    const body: unknown = JSON.parse(text)
    const check = ajv.compile(definition.content['application/json'].schema)
    expect(check(body) ? [] : check.errors).toEqual([])
    return { body, headers: response.headers }
  }
}
