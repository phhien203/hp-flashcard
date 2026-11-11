import { run, claudeCode } from '@ai-hero/sandcastle'
import { noSandbox } from '@ai-hero/sandcastle/sandboxes/no-sandbox'

// Blank template: customize this to build your own orchestration.
// Run with: pnpm sandcastle
//
// noSandbox() runs the agent directly on the host with no isolation, and uses
// your normal Claude Code permission settings (no --dangerously-skip-permissions).
// To isolate it later, swap in bwrap() or docker() from "@ai-hero/sandcastle/sandboxes/*".

await run({
  agent: claudeCode('claude-opus-5-5'),
  sandbox: noSandbox(),
  promptFile: './.sandcastle/prompt.md',
})
