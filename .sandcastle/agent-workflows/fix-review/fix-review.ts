import * as fs from 'node:fs'
import * as path from 'node:path'
import * as sandcastle from '@ai-hero/sandcastle'
import { noSandbox } from '@ai-hero/sandcastle/sandboxes/no-sandbox'
import { z } from 'zod/v4'
import { claudeAgent, required, writeJson } from '../shared/common'
import { extractionPrompt } from '../shared/extraction-prompt'
import { runWithExtraction } from '../shared/run-with-extraction'
import { repliesSchema, validateReplies } from './replies'

const threads = z
  .array(z.object({ id: z.string() }))
  .parse(JSON.parse(fs.readFileSync('/tmp/fix-review-threads.json', 'utf8')))

const result = await runWithExtraction({
  name: 'fix-review',
  agent: claudeAgent(),
  sandbox: noSandbox(),
  logging: { type: 'stdout' },
  promptFile: path.join(import.meta.dirname, 'prompt.md'),
  promptArgs: { PR_NUMBER: required('PR_NUMBER') },
  output: sandcastle.Output.object({ tag: 'replies', schema: repliesSchema }),
  extractionPrompt: extractionPrompt('replies', repliesSchema),
})

writeJson('fix-review-replies.json', validateReplies(threads, result.output))
