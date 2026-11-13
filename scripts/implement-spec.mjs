import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const gh = (...args) =>
  JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }))

// Serialize builds: an open PR is not an implemented prerequisite on main.
export function selectTicket(spec, tickets, pulls) {
  if (spec.labels.some((label) => label.name === 'agent:blocked')) {
    return {
      mode: 'paused',
      reason: 'Remove agent:blocked from the spec to retry.',
    }
  }
  if (tickets.length === 0) {
    return {
      mode: 'no-tickets',
      reason: 'Create native sub-issues before running.',
    }
  }
  const open = tickets.filter((ticket) => ticket.state === 'open')
  if (open.length === 0)
    return { mode: 'drained', reason: 'All tickets are closed.' }
  if (
    open.some((ticket) =>
      ticket.labels.some((label) => label.name === 'agent:in-progress'),
    )
  ) {
    return {
      mode: 'waiting',
      reason:
        'A ticket is claimed; investigate stale claims before continuing.',
    }
  }

  for (const ticket of open) {
    const prefix = `agent/spec-${spec.number}-ticket-${ticket.number}-`
    const related = pulls.filter(
      (pull) =>
        pull.headRefName.startsWith(prefix) ||
        pull.closingIssuesReferences.some(
          (issue) => issue.number === ticket.number,
        ),
    )
    if (related.some((pull) => pull.state === 'OPEN')) {
      return {
        mode: 'waiting',
        reason: `Waiting for #${ticket.number}'s PR to merge.`,
      }
    }
    if (related.some((pull) => pull.mergedAt)) {
      return {
        mode: 'waiting',
        reason: `A PR merged for #${ticket.number}; close the ticket before continuing.`,
      }
    }
  }

  const ticket = open.find(
    (candidate) =>
      !candidate.labels.some((label) =>
        ['agent:blocked', 'agent:in-progress'].includes(label.name),
      ) && candidate.blockers.every((blocker) => blocker.state === 'closed'),
  )
  return ticket
    ? {
        mode: 'implement',
        ticket: ticket.number,
        reason: `Build #${ticket.number}.`,
      }
    : {
        mode: 'waiting',
        reason: 'No unblocked, unclaimed ticket is available.',
      }
}

export function survey() {
  const repo = process.env.GH_REPO
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) throw new Error('Invalid GH_REPO')
  const requested = process.env.REQUESTED_SPEC
  const number =
    requested ||
    gh(
      'issue',
      'list',
      '--repo',
      repo,
      '--state',
      'open',
      '--label',
      'agent:implement-spec',
      '--limit',
      '1',
      '--json',
      'number',
    )[0]?.number
  if (!number) return { mode: 'no-spec', reason: 'No labelled spec.' }
  if (!/^\d+$/.test(String(number))) throw new Error('Invalid spec number')

  const api = (endpoint) =>
    gh('api', '--paginate', '--slurp', `repos/${repo}/${endpoint}`).flat()
  const spec = gh('api', `repos/${repo}/issues/${number}`)
  if (spec.state !== 'open') {
    return { mode: 'drained', spec: number, reason: 'Spec is closed.' }
  }
  const tickets = api(`issues/${number}/sub_issues`).map((ticket) => ({
    ...ticket,
    blockers: api(`issues/${ticket.number}/dependencies/blocked_by`),
  }))
  const pulls = gh(
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'all',
    '--limit',
    '1000',
    '--json',
    'headRefName,state,mergedAt,closingIssuesReferences',
  )
  if (pulls.length >= 1000) {
    throw new Error(
      'PR scan limit reached; refusing to risk a duplicate build.',
    )
  }
  return { spec: number, ...selectTicket(spec, tickets, pulls) }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = survey()
  console.log(result.reason)
  if (process.env.GITHUB_OUTPUT) {
    for (const key of ['mode', 'spec', 'ticket']) {
      if (result[key] !== undefined) {
        appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${result[key]}\n`)
      }
    }
  }
}
