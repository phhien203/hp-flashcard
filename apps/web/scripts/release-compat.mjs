// Run the previous Worker's own HTTP tests against the candidate migrations.
// Everything runs on disposable LOCAL D1. No provider credentials are inherited.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const review = JSON.parse(
  readFileSync(`${root}apps/web/release/migrations.json`, 'utf8'),
)
// Explicit diagnostic mode can rehearse the initial (not yet deployed) baseline.
const previous =
  process.argv[2] === 'verify-baseline'
    ? process.argv[3]
    : review.compatibleWithCommit
if (previous === null) {
  console.log('Initial release: no previous deployed Worker to test.')
} else {
  if (!/^[a-f0-9]{40}$/.test(previous ?? ''))
    throw new Error('Compatibility review must name a full previous commit SHA')
  execFileSync('git', ['merge-base', '--is-ancestor', previous, 'HEAD'], {
    cwd: root,
  })
  const tempRoot =
    process.env.RUNNER_TEMP ??
    (existsSync(join(tmpdir(), 'opencode'))
      ? join(tmpdir(), 'opencode')
      : tmpdir())
  const scratch = mkdtempSync(join(tempRoot, 'hp-flashcard-compat-'))
  const env = { HUSKY: '0' }
  for (const key of [
    'PATH',
    'HOME',
    'CI',
    'TMPDIR',
    'PNPM_HOME',
    'COREPACK_HOME',
  ])
    if (process.env[key]) env[key] = process.env[key]
  try {
    const archive = execFileSync('git', ['archive', previous], {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
    })
    execFileSync('tar', ['-x', '-C', scratch], { input: archive })
    cpSync(`${root}apps/web/migrations`, `${scratch}/apps/web/migrations`, {
      recursive: true,
    })
    execFileSync('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], {
      cwd: scratch,
      env,
      stdio: 'inherit',
    })
    execFileSync(
      'pnpm',
      ['exec', 'vitest', 'run', '--project', '*web:worker*'],
      {
        cwd: scratch,
        env,
        stdio: 'inherit',
      },
    )
  } finally {
    // Only the unique directory this invocation just created.
    rmSync(scratch, { recursive: true, force: true })
  }
}
