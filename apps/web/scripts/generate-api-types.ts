import { writeFile } from 'node:fs/promises'

import { generateApiTypes, TYPES_URL } from './api-types.ts'

await writeFile(TYPES_URL, await generateApiTypes())
console.log(`Wrote ${TYPES_URL.pathname}`)
