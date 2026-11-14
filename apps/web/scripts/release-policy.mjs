import { createHash } from 'node:crypto'

export function buildIdentity(env, checkout) {
  if (
    env.WORKERS_CI !== '1' ||
    env.WORKERS_CI_BRANCH !== 'main' ||
    !/^[a-f0-9]{40}$/.test(checkout) ||
    env.WORKERS_CI_COMMIT_SHA !== checkout ||
    !/^[a-f0-9-]{36}$/.test(env.WORKERS_CI_BUILD_UUID ?? '')
  )
    throw new Error(
      'Release requires a Cloudflare main-branch build of this checkout',
    )
  if (!env.VITE_CLERK_PUBLISHABLE_KEY?.startsWith('pk_live_'))
    throw new Error('Build requires the production Clerk publishable key')
  return { commit: checkout, build: env.WORKERS_CI_BUILD_UUID }
}

export function checkProductionConfig(config) {
  const production = config.env?.production
  const assets = production?.assets ?? config.assets
  const databases = production?.d1_databases
  if (
    production?.name !== 'hp-flashcard' ||
    (production?.workers_dev ?? config.workers_dev) !== false ||
    (production?.preview_urls ?? config.preview_urls) !== false ||
    production?.routes?.length !== 1 ||
    production.routes[0].pattern !== 'flashcard.hien.page' ||
    production.routes[0].custom_domain !== true ||
    production.vars?.CLERK_AUTHORIZED_PARTIES !==
      'https://flashcard.hien.page' ||
    assets?.directory !== './dist' ||
    assets?.not_found_handling !== 'single-page-application' ||
    !assets?.run_worker_first?.includes('/api/*') ||
    databases?.length !== 1 ||
    databases[0].binding !== 'DB' ||
    !/^[a-f0-9-]{36}$/.test(databases[0].database_id ?? '') ||
    databases[0].database_id === '00000000-0000-0000-0000-000000000000'
  )
    throw new Error(
      'Production domain, assets, aliases, Clerk origin or D1 is not configured',
    )
}

export function checkMigrations(files, review) {
  if (!review.compatibility?.trim())
    throw new Error('Missing migration compatibility review')
  if (
    review.compatibleWithCommit !== null &&
    !/^[a-f0-9]{40}$/.test(review.compatibleWithCommit ?? '')
  )
    throw new Error(
      'Migration compatibility baseline must be a full commit SHA',
    )
  const names = Object.keys(files).sort()
  if (
    JSON.stringify(names) !== JSON.stringify(Object.keys(review.files).sort())
  )
    throw new Error('Migration list differs from its review')
  for (const name of names) {
    const hash = createHash('sha256').update(files[name]).digest('hex')
    if (hash !== review.files[name])
      throw new Error(`Migration not reviewed: ${name}`)
  }
}

export function checkReceipt(receipt, identity) {
  if (receipt.commit !== identity.commit || receipt.build !== identity.build)
    throw new Error('Frontend artifacts do not belong to this Cloudflare build')
}

/** Cloudflare's build step must succeed before its deploy step is invoked. */
export async function deploy(io, identity) {
  await io.validate(identity)
  await io.migrate()
  await io.publish(identity)
  await io.health(identity)
}
