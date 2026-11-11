import { playwright } from '@vitest/browser-playwright'

const SUPPORTED = ['chromium', 'firefox', 'webkit'] as const
type Browser = (typeof SUPPORTED)[number]

const isSupported = (name: string): name is Browser =>
  (SUPPORTED as readonly string[]).includes(name)

/**
 * Vitest browser-mode config shared by every test project.
 *
 * Which browsers run is controlled by the VITEST_BROWSERS env var (comma-separated):
 *   pnpm test       -> chromium (fast local loop)
 *   pnpm test:all   -> chromium, firefox, webkit
 *   CI              -> one browser per matrix job
 */
export function browserTestConfig() {
  const requested = (process.env.VITEST_BROWSERS ?? 'chromium')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

  const unknown = requested.filter((name) => !isSupported(name))
  if (unknown.length > 0) {
    throw new Error(
      `Unknown VITEST_BROWSERS entry: ${unknown.join(', ')}. Use ${SUPPORTED.join(', ')}.`,
    )
  }

  return {
    enabled: true,
    headless: true,
    provider: playwright(),
    instances: requested.filter(isSupported).map((browser) => ({ browser })),
  }
}
