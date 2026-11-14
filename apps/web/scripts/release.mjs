import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

import {
  buildIdentity,
  checkMigrations,
  checkProductionConfig,
  checkReceipt,
  deploy,
} from './release-policy.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const app = `${root}apps/web/`
const run = (...args) =>
  execFileSync('pnpm', args, { cwd: root, stdio: 'inherit' })
const wrangler = (...args) =>
  run('--filter', '@hp-flashcard/web', 'exec', 'wrangler', ...args)

function validate() {
  const checkout = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  const identity = buildIdentity(process.env, checkout)
  for (const name of [
    '.env',
    '.env.local',
    '.env.production',
    '.env.production.local',
    '.dev.vars',
    '.dev.vars.production',
  ]) {
    if (existsSync(`${app}${name}`))
      throw new Error(
        'Release checkout must not contain local environment files',
      )
  }
  const parsed = ts.parseConfigFileTextToJson(
    'wrangler.jsonc',
    readFileSync(`${app}wrangler.jsonc`, 'utf8'),
  )
  if (parsed.error) throw new Error('Invalid Wrangler JSONC')
  checkProductionConfig(parsed.config)
  const files = Object.fromEntries(
    readdirSync(`${app}migrations`)
      .filter((name) => name.endsWith('.sql'))
      .map((name) => [name, readFileSync(`${app}migrations/${name}`)]),
  )
  checkMigrations(
    files,
    JSON.parse(readFileSync(`${app}release/migrations.json`, 'utf8')),
  )
  return identity
}

async function health(identity) {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const options = {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      }
      const origin = 'https://flashcard.hien.page'
      const response = await fetch(`${origin}/api/health`, options)
      const data = await response.json()
      if (
        response.ok &&
        data.status === 'ok' &&
        data.commit === identity.commit &&
        /^[a-f0-9-]{36}$/.test(data.version ?? '')
      ) {
        const marker = await fetch(`${origin}/release.json`, options)
        const assets = await marker.json()
        const frontend = await fetch(`${origin}/`, options)
        const denied = await fetch(`${origin}/api/cards`, options)
        if (
          marker.ok &&
          assets.commit === identity.commit &&
          assets.build === identity.build &&
          frontend.ok &&
          frontend.headers.get('content-type')?.includes('text/html') &&
          denied.status === 401
        ) {
          console.log(
            JSON.stringify({
              event: 'release_healthy',
              ...identity,
              version: data.version,
            }),
          )
          return
        }
      }
    } catch {
      // Retry propagation. Never log response bodies or exception messages.
    }
    await setTimeout(5_000)
  }
  throw new Error(
    'Custom-domain health failed; inspect the serving version and use code-only rollback if needed',
  )
}

async function main() {
  const command = process.argv[2]
  if (!['build', 'deploy'].includes(command))
    throw new Error('Expected build or deploy')
  const identity = validate()
  if (command === 'build') {
    // Optional prior-Worker compatibility gate, local D1 only.
    run('exec', 'node', 'apps/web/scripts/release-compat.mjs')
    run('build:web')
    wrangler('deploy', '--env', 'production', '--dry-run')
    writeFileSync(`${app}dist/release.json`, JSON.stringify(identity))
    return
  }
  await deploy(
    {
      async validate() {
        checkReceipt(
          JSON.parse(readFileSync(`${app}dist/release.json`, 'utf8')),
          identity,
        )
      },
      async migrate() {
        wrangler(
          'd1',
          'migrations',
          'apply',
          'DB',
          '--remote',
          '--env',
          'production',
        )
      },
      async publish() {
        wrangler(
          'deploy',
          '--env',
          'production',
          '--tag',
          identity.commit,
          '--message',
          `Build ${identity.build}`,
        )
      },
      health,
    },
    identity,
  )
}

main().catch(() => {
  console.error(
    'Cloudflare release stopped. Inspect the last completed command and docs/web-release.md; never automatically reverse migrations.',
  )
  process.exitCode = 1
})
