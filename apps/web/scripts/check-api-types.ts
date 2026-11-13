import { readFile } from 'node:fs/promises'

import { generateApiTypes, TYPES_URL } from './api-types.ts'

const current = await readFile(TYPES_URL, 'utf8').catch(() => '')
if (current !== (await generateApiTypes())) {
  console.error(
    'src/api/schema.d.ts is out of date with api/openapi.yaml. Run `pnpm --filter @hp-flashcard/web generate:api`.',
  )
  process.exit(1)
}
console.log('API types are up to date.')
