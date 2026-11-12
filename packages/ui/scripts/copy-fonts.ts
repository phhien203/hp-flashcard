/*
 * The Tailwind CLI inlines @fontsource/poppins's @font-face rules into
 * dist/styles.css but leaves their url()s as written (`./files/…`), relative
 * to the @fontsource package. Copy each referenced font file to the same
 * path relative to dist/styles.css so the URLs work in the published package.
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fontFaceUrls } from './built-css.ts'

const cssFile = new URL('../dist/styles.css', import.meta.url)
const fontsource = import.meta.resolve('@fontsource/poppins/400.css')

const css = await readFile(cssFile, 'utf8')
const urls = [...new Set(fontFaceUrls(css))]

for (const url of urls) {
  if (!url.startsWith('./')) {
    throw new Error(`Unexpected font URL in dist/styles.css: ${url}`)
  }
  const target = fileURLToPath(new URL(url, cssFile))
  await mkdir(dirname(target), { recursive: true })
  await copyFile(fileURLToPath(new URL(url, fontsource)), target)
}

console.log(`Copied ${urls.length} font files next to dist/styles.css`)
