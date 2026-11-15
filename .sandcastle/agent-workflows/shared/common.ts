import * as fs from 'node:fs'
import * as path from 'node:path'
import * as sandcastle from '@ai-hero/sandcastle'

export const outputDir = (): string => process.env.OUTPUT_DIR ?? '/tmp'

export const required = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return value
}

export const writeJson = (filename: string, value: unknown): void => {
  fs.mkdirSync(outputDir(), { recursive: true })
  fs.writeFileSync(
    path.join(outputDir(), filename),
    JSON.stringify(value, null, 2),
  )
}

// The default factory agent. It authenticates with a Claude
// subscription. To bill the API instead, pass ANTHROPIC_API_KEY here and in
// the workflow's env in place of CLAUDE_CODE_OAUTH_TOKEN.
//
// Sandcastle runs every agent with its permission checks skipped, so it can
// use any tool. Claude Code also accepts `permissionMode: "auto"` here for
// AI-mediated approvals instead (Claude only; other agents don't offer it).
export const claudeAgent = () =>
  sandcastle.claudeCode('claude-opus-5-5', {
    env: {
      CLAUDE_CODE_OAUTH_TOKEN: required('CLAUDE_CODE_OAUTH_TOKEN'),
    },
  })

// The GPT workflows restore subscription credentials before invoking us.
// Leave claudeAgent unchanged for factory entrypoints without a GPT variant.
export const factoryAgent = () => {
  switch (process.env.FACTORY_AGENT ?? 'claude') {
    case 'claude':
      return claudeAgent()
    case 'codex':
      return sandcastle.codex(process.env.CODEX_MODEL || 'gpt-6.1-sol', {
        effort: 'high',
      })
    default:
      throw new Error(`Unknown factory agent: ${process.env.FACTORY_AGENT}`)
  }
}
