/*
 * Checks for the precompiled `dist/styles.css`, kept free of Node APIs so
 * they run in the browser-mode unit tests too. Later token tickets extend
 * REQUIRED_SELECTORS and FORBIDDEN_PATTERNS.
 */

/** Utilities the precompiled CSS must contain: the Figma tokens. */
export const REQUIRED_SELECTORS = [
  '.text-preset-1',
  '.text-preset-2',
  '.text-preset-3',
  '.text-preset-4-semibold',
  '.text-preset-4-medium',
  '.text-preset-4-regular',
  '.text-preset-5-medium',
  '.text-preset-5-regular',
  '.text-preset-6',
]

/** Tailwind or shadcn defaults the design system replaces. */
export const FORBIDDEN_PATTERNS: { name: string; pattern: RegExp }[] = [
  {
    name: "Tailwind's default --font-sans (it should be Poppins)",
    pattern: /--font-sans:\s*ui-sans-serif/,
  },
]

const FONT_FAMILY = 'Poppins'
/** The Poppins weights fonts.css loads. */
export const FONT_WEIGHTS = ['400', '500', '600', '700']

/** Every @font-face rule, as text. */
function fontFaces(css: string): string[] {
  return [...css.matchAll(/@font-face\s*{[^}]*}/g)].map(([face]) => face)
}

/** Every url() inside an @font-face rule. */
export function fontFaceUrls(css: string): string[] {
  const urls: string[] = []
  for (const block of fontFaces(css)) {
    for (const [, raw = ''] of block.matchAll(/url\(([^)]*)\)/g)) {
      urls.push(raw.trim().replace(/^(['"])(.*)\1$/, '$2'))
    }
  }
  return urls
}

/**
 * Resolves a url() found in `cssPath` to a package-relative path, or returns
 * undefined when it points outside the package (absolute, remote, or `../`
 * past the package root).
 */
export function resolvePackagePath(
  cssPath: string,
  url: string,
): string | undefined {
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('/')) return undefined
  const segments = cssPath.split('/').slice(0, -1)
  for (const segment of url.split(/[?#]/)[0]!.split('/')) {
    if (segment === '..') {
      if (segments.pop() === undefined) return undefined
    } else if (segment !== '.' && segment !== '') {
      segments.push(decodeURIComponent(segment))
    }
  }
  return segments.join('/')
}

function hasSelector(css: string, selector: string): boolean {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}(?![\\w-])`).test(css)
}

/**
 * Returns every problem with the built CSS; an empty array means it passes.
 * `cssPath` is the CSS file's path inside the package (e.g. `dist/styles.css`)
 * and `packedFiles` lists every path that `pnpm pack` ships.
 */
export function checkBuiltCss({
  css,
  cssPath,
  packedFiles,
}: {
  css: string
  cssPath: string
  packedFiles: readonly string[]
}): string[] {
  const errors: string[] = []
  const packed = new Set(packedFiles)

  for (const selector of REQUIRED_SELECTORS) {
    if (!hasSelector(css, selector)) errors.push(`missing ${selector}`)
  }
  for (const { name, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(css)) errors.push(`contains ${name}`)
  }

  const faces = fontFaces(css)
  for (const weight of FONT_WEIGHTS) {
    const found = faces.some(
      (face) =>
        face.includes(FONT_FAMILY) &&
        new RegExp(`font-weight:\\s*${weight}\\b`).test(face),
    )
    if (!found) errors.push(`missing ${FONT_FAMILY} ${weight} @font-face`)
  }

  for (const url of fontFaceUrls(css)) {
    const path = resolvePackagePath(cssPath, url)
    if (path === undefined) {
      errors.push(`font URL ${url} points outside the package`)
    } else if (!packed.has(path)) {
      errors.push(`font URL ${url} -> ${path} is not in the packed output`)
    }
  }

  return errors
}
