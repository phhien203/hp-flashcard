import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { test } from 'node:test'
import { factoryAgent } from '../.sandcastle/agent-workflows/shared/common.ts'

test('factory defaults to Claude and keeps its subscription authentication', (t) => {
  const before = { ...process.env }
  t.after(() => {
    process.env = before
  })
  delete process.env.FACTORY_AGENT
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'test-claude-token'
  const agent = factoryAgent()
  assert.equal(agent.name, 'claude-code')
  assert.equal(agent.env.CLAUDE_CODE_OAUTH_TOKEN, 'test-claude-token')
})

test('Codex needs no Claude credential and supports extraction session resume', (t) => {
  const before = { ...process.env }
  t.after(() => {
    process.env = before
  })
  process.env.FACTORY_AGENT = 'codex'
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  delete process.env.CODEX_MODEL
  const agent = factoryAgent()
  assert.equal(agent.name, 'codex')
  assert.ok(agent.sessionStorage)
  assert.match(
    agent.buildPrintCommand({ prompt: 'test' }).command,
    /gpt-6\.1-sol/,
  )
  process.env.CODEX_MODEL = 'test-model'
  assert.match(
    factoryAgent().buildPrintCommand({ prompt: 'test' }).command,
    /test-model/,
  )
  process.env.FACTORY_AGENT = 'typo'
  assert.throws(() => factoryAgent(), /Unknown factory agent/)
})

const action = fs.readFileSync(
  new URL('../.github/actions/run-factory-agent/action.yml', import.meta.url),
  'utf8',
)
const script = action.split('      run: |\n')[1].replace(/^ {8}/gm, '')

for (const exitCode of [0, 1]) {
  test(`Codex action restores private credentials and cleans up after exit ${exitCode}`, (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-agent-test-'))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    const bin = path.join(dir, 'bin')
    fs.mkdirSync(bin)
    fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\nexit 0\n', {
      mode: 0o755,
    })
    fs.writeFileSync(
      path.join(bin, 'pnpm'),
      `#!${process.execPath}
const fs = require('node:fs')
const path = require('node:path')
const file = path.join(process.env.HOME, '.codex/auth.json')
fs.writeFileSync(process.env.PROBE, JSON.stringify({
  agent: process.env.FACTORY_AGENT,
  auth: JSON.parse(fs.readFileSync(file, 'utf8')),
  mode: fs.statSync(file).mode & 0o777,
  args: process.argv.slice(2),
}))
process.exit(Number(process.env.TEST_EXIT))
`,
      { mode: 0o755 },
    )
    const probe = path.join(dir, 'probe.json')
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: dir,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        USE_GPT: 'true',
        CODEX_AUTH_JSON: '{"tokens":{"access_token":"test-secret"}}',
        ENTRYPOINT: 'test-entrypoint.ts',
        PROBE: probe,
        TEST_EXIT: String(exitCode),
      },
    })
    assert.equal(result.status, exitCode, result.stderr)
    assert.deepEqual(JSON.parse(fs.readFileSync(probe, 'utf8')), {
      agent: 'codex',
      auth: { tokens: { access_token: 'test-secret' } },
      mode: 0o600,
      args: ['exec', 'tsx', 'test-entrypoint.ts'],
    })
    assert.equal(fs.existsSync(path.join(dir, '.codex/auth.json')), false)
    assert.doesNotMatch(result.stdout + result.stderr, /test-secret/)
  })
}

test('Codex action fails clearly when the subscription secret is absent', () => {
  const env = { ...process.env, USE_GPT: 'true' }
  delete env.CODEX_AUTH_JSON
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Set the CODEX_AUTH_JSON repository secret/)
})

test('Claude action still runs without a Codex secret', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-claude-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\nexit 0\n', {
    mode: 0o755,
  })
  fs.writeFileSync(
    path.join(bin, 'pnpm'),
    '#!/bin/sh\nprintf "%s" "$FACTORY_AGENT"\n',
    { mode: 0o755 },
  )
  const env = {
    ...process.env,
    HOME: dir,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    USE_GPT: 'false',
    ENTRYPOINT: 'test-entrypoint.ts',
  }
  delete env.CODEX_AUTH_JSON
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'claude')
  assert.equal(fs.existsSync(path.join(dir, '.codex')), false)
})
