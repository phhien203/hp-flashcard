import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

import {
  buildIdentity,
  checkMigrations,
  checkProductionConfig,
  checkReceipt,
  deploy,
} from './release-policy.mjs'

const sha = 'a'.repeat(40)
const env = {
  WORKERS_CI: '1',
  WORKERS_CI_BRANCH: 'main',
  WORKERS_CI_COMMIT_SHA: sha,
  WORKERS_CI_BUILD_UUID: '11111111-1111-1111-1111-111111111111',
  VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_example',
}

test('only a matching main checkout in Cloudflare Builds can release', () => {
  assert.deepEqual(buildIdentity(env, sha), {
    commit: sha,
    build: env.WORKERS_CI_BUILD_UUID,
  })
  for (const changes of [
    { WORKERS_CI: undefined },
    { WORKERS_CI_BRANCH: 'feature' },
    { WORKERS_CI_COMMIT_SHA: 'b'.repeat(40) },
    { WORKERS_CI_BUILD_UUID: '' },
    { VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_example' },
  ])
    assert.throws(() => buildIdentity({ ...env, ...changes }, sha))
})

test('production config refuses placeholder D1, wrong domain/origin or public aliases', () => {
  const config = ts.parseConfigFileTextToJson(
    'wrangler.jsonc',
    readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
  ).config
  config.env.production.d1_databases[0].database_id =
    '00000000-0000-0000-0000-000000000000'
  assert.throws(() => checkProductionConfig(config))
  config.env.production.d1_databases[0].database_id = env.WORKERS_CI_BUILD_UUID
  checkProductionConfig(config)
  for (const mutate of [
    (c) => {
      c.env.production.workers_dev = true
    },
    (c) => {
      c.preview_urls = true
    },
    (c) => {
      c.env.production.routes[0].pattern = 'example.com'
    },
    (c) => {
      c.env.production.vars.CLERK_AUTHORIZED_PARTIES = 'http://localhost:5173'
    },
    (c) => {
      c.assets.run_worker_first = []
    },
  ]) {
    const broken = structuredClone(config)
    mutate(broken)
    assert.throws(() => checkProductionConfig(broken))
  }
})

test('migrations must match the exact reviewed file list and hashes', () => {
  const files = { '0000.sql': 'CREATE TABLE example (id TEXT);' }
  const review = {
    compatibleWithCommit: null,
    compatibility: 'Initial additive schema',
    files: {
      '0000.sql': createHash('sha256').update(files['0000.sql']).digest('hex'),
    },
  }
  checkMigrations(files, review)
  assert.throws(() =>
    checkMigrations({ '0000.sql': 'DROP TABLE example;' }, review),
  )
  assert.throws(() => checkMigrations({}, review))
  assert.throws(() => checkMigrations({ ...files, '0001.sql': '' }, review))
  assert.throws(() => checkMigrations(files, { ...review, compatibility: '' }))
})

test('deploy requires frontend artifacts from this build, not cached branch output', () => {
  const identity = buildIdentity(env, sha)
  checkReceipt(identity, identity)
  assert.throws(() => checkReceipt({ ...identity, commit: 'old' }, identity))
  assert.throws(() =>
    checkReceipt({ ...identity, build: 'old-build' }, identity),
  )
})

for (const fail of [null, 'validate', 'migrate', 'publish', 'health']) {
  test(`deployment order and stop-on-failure (${fail ?? 'success'})`, async () => {
    const calls = []
    const names = ['validate', 'migrate', 'publish', 'health']
    const io = Object.fromEntries(
      names.map((name) => [
        name,
        async () => {
          calls.push(name)
          if (name === fail) throw new Error(name)
        },
      ]),
    )
    if (fail) await assert.rejects(deploy(io, buildIdentity(env, sha)))
    else await deploy(io, buildIdentity(env, sha))
    assert.deepEqual(
      calls,
      fail ? names.slice(0, names.indexOf(fail) + 1) : names,
    )
  })
}
