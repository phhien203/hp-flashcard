import openapiTS, { astToString } from 'openapi-typescript'

/** The OpenAPI document: the API's source of truth. */
export const SPEC_URL = new URL('../api/openapi.yaml', import.meta.url)

/** Where the generated types live. */
export const TYPES_URL = new URL('../src/api/schema.d.ts', import.meta.url)

const HEADER = `/**
 * Generated from api/openapi.yaml by openapi-typescript. Do not edit:
 * run \`pnpm --filter @hp-flashcard/web generate:api\` instead.
 */

`

/** The TypeScript the OpenAPI document generates, as it should be on disk. */
export async function generateApiTypes() {
  const ast = await openapiTS(SPEC_URL)
  return HEADER + astToString(ast)
}
