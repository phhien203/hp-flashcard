/*
 * Post-build check of the precompiled dist/styles.css against what
 * `pnpm pack` would publish. Run after `pnpm build`.
 */
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

import { checkBuiltCss } from './built-css.ts'

const cssPath = 'dist/styles.css'
const packageDir = new URL('../', import.meta.url)

const pack = JSON.parse(
  execFileSync('pnpm', ['pack', '--dry-run', '--json'], {
    cwd: packageDir,
    encoding: 'utf8',
  }),
) as { files: { path: string }[] }
const packedFiles = pack.files.map((file) => file.path)

if (!packedFiles.includes(cssPath)) {
  console.error(`${cssPath} is not in the packed output. Run pnpm build first.`)
  process.exit(1)
}

const css = await readFile(new URL(cssPath, packageDir), 'utf8')
const errors = checkBuiltCss({ css, cssPath, packedFiles })

if (errors.length > 0) {
  console.error(`${cssPath} failed the built-CSS check:`)
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}
console.log(`${cssPath} passed the built-CSS check.`)
