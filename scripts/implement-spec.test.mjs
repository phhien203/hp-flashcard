import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectTicket } from './implement-spec.mjs'

const spec = { number: 45, labels: [] }
const ticket = (number, blockers = []) => ({
  number,
  state: 'open',
  labels: [],
  blockers,
})
const tickets = [ticket(47), ticket(48, [{ state: 'open' }]), ticket(49)]

test('uses existing native children without queue labels or position metadata', () => {
  assert.equal(selectTicket(spec, tickets, []).ticket, 47)
})

test('does not invent a decomposition when children are missing', () => {
  assert.equal(selectTicket(spec, [], []).mode, 'no-tickets')
})

test('waits for a draft PR instead of starting another build', () => {
  const pulls = [
    {
      headRefName: 'agent/spec-45-ticket-47-123',
      state: 'OPEN',
      mergedAt: null,
      closingIssuesReferences: [],
    },
  ]
  assert.equal(selectTicket(spec, tickets, pulls).mode, 'waiting')
})

test('recognizes manually opened closing PRs too', () => {
  const pulls = [
    {
      headRefName: 'feature/cards',
      state: 'OPEN',
      mergedAt: null,
      closingIssuesReferences: [{ number: 47 }],
    },
  ]
  assert.equal(selectTicket(spec, tickets, pulls).mode, 'waiting')
})

test('does not rebuild an open ticket whose PR already merged', () => {
  const pulls = [
    {
      headRefName: 'agent/spec-45-ticket-47-123',
      state: 'MERGED',
      mergedAt: '2026-11-13',
      closingIssuesReferences: [],
    },
  ]
  assert.equal(selectTicket(spec, tickets, pulls).mode, 'waiting')
})

test('advances after merge/closure using native blocker states', () => {
  const afterMerge = [
    { ...ticket(47), state: 'closed' },
    ticket(48, [{ state: 'closed' }]),
    ticket(49),
  ]
  assert.equal(selectTicket(spec, afterMerge, []).ticket, 48)
})

test('pauses the whole spec after a failure, including explicit dispatches', () => {
  assert.equal(
    selectTicket({ ...spec, labels: [{ name: 'agent:blocked' }] }, tickets, [])
      .mode,
    'paused',
  )
})

test('never selects a blocked or claimed ticket', () => {
  for (const name of ['agent:blocked', 'agent:in-progress']) {
    const candidate = { ...ticket(47), labels: [{ name }] }
    assert.equal(selectTicket(spec, [candidate], []).mode, 'waiting')
  }
  assert.equal(selectTicket(spec, [tickets[1]], []).mode, 'waiting')
})

test('a leftover claim after cancellation prevents another build', () => {
  assert.equal(
    selectTicket(
      spec,
      [{ ...ticket(47), labels: [{ name: 'agent:in-progress' }] }, ticket(48)],
      [],
    ).mode,
    'waiting',
  )
})

test('reports drained only when all existing children are closed', () => {
  assert.equal(
    selectTicket(spec, [{ ...ticket(47), state: 'closed' }], []).mode,
    'drained',
  )
})
