import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'hp-flashcard-stage-'))
const tarball = join(directory, 'package.tgz')

try {
  // pnpm resolves catalog: dependencies in the packed manifest; npm does not.
  execFileSync('pnpm', ['--dir', 'packages/ui', 'pack', '--out', tarball], {
    stdio: 'inherit',
  })
  execFileSync(
    'npm',
    [
      'stage',
      'publish',
      tarball,
      '--access',
      'public',
      ...process.argv.slice(2),
    ],
    { stdio: 'inherit' },
  )
} finally {
  rmSync(directory, { recursive: true, force: true })
}
