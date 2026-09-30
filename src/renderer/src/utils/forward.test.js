import { describe, expect, it } from 'vitest'
import {
  activeForwards,
  configRequest,
  forwardEntries,
  forwardHint,
  forwardPlan,
  forwardSummary,
  isRoutable,
  normalizeForward,
  portState
} from './forward'

const server = { name: 'bastion', user: 'me', host: 'bastion.example.com', port: '22' }
const inner = { name: 'inner', user: 'me', host: 'inner.example.com', port: '22' }
// 이전 버전 방식: ssh로 접속하지 않는 대상 노드 (port를 비워 둔다)
const target = { name: 'db', user: '', host: 'db.internal', port: '' }

describe('isRoutable', () => {
  it('needs user, host and port', () => {
    expect(isRoutable(server)).toBe(true)
    expect(isRoutable({ ...server, port: '' })).toBe(false)
    expect(isRoutable({ ...server, user: null })).toBe(false)
    expect(isRoutable({ ...server, host: '' })).toBe(false)
    expect(isRoutable(null)).toBe(false)
    expect(isRoutable(undefined)).toBe(false)
  })
})

describe('portState', () => {
  it('shows nothing for an empty optional value and an error for an empty required one', () => {
    expect(portState('')).toBeNull()
    expect(portState(null)).toBeNull()
    expect(portState('', true)).toBe(false)
    expect(portState(undefined, true)).toBe(false)
  })

  it('only flags invalid values (valid ones show no state)', () => {
    expect(portState('22')).toBeNull()
    expect(portState('65535')).toBeNull()
    expect(portState('1')).toBeNull()
    expect(portState('22', true)).toBeNull()
    for (const bad of ['0', '65536', '-1', '1e3', '22a', ' 22', '123456']) {
      expect(portState(bad), bad).toBe(false)
    }
  })
})

describe('normalizeForward', () => {
  it('adds the host field that older versions did not save', () => {
    expect(normalizeForward({ checked: true, from: '8080', to: '80' })).toEqual({ checked: true, from: '8080', host: null, to: '80' })
  })

  it('keeps the host and coerces the rest', () => {
    expect(normalizeForward({ from: '1', host: 'h', to: '2' })).toEqual({ checked: false, from: '1', host: 'h', to: '2' })
    expect(normalizeForward(null)).toEqual({ checked: false, from: null, host: null, to: null })
  })
})

describe('forwardPlan', () => {
  it('a node with user/host/port forwards through itself, even as the first node', () => {
    const plan = forwardPlan(server, [])
    expect(plan.mode).toBe('self')
    expect(plan.via).toEqual([server])
    expect(plan.defaultHost).toBe('localhost')
    expect(plan.reason).toBeNull()
  })

  it('goes through all previous nodes first and forwards on the node itself', () => {
    const plan = forwardPlan(inner, [server])
    expect(plan.mode).toBe('self')
    expect(plan.via).toEqual([server, inner])
  })

  it('cannot open anything when a previous node is incomplete', () => {
    const plan = forwardPlan(inner, [{ ...server, user: '' }])
    expect(plan.mode).toBeNull()
    expect(plan.reason).toMatch(/previous node/)
  })

  it('an older-style target node (no user/port) forwards to its host through the previous nodes', () => {
    const plan = forwardPlan(target, [server, inner])
    expect(plan.mode).toBe('target')
    expect(plan.via).toEqual([server, inner])
    expect(plan.defaultHost).toBe('db.internal')
  })

  it('needs something to connect through', () => {
    expect(forwardPlan({ ...server, port: '' }, [])).toMatchObject({ mode: null, reason: expect.stringMatching(/user, host and port/) })
    expect(forwardPlan({ user: '', host: '', port: '' }, [server])).toMatchObject({ mode: null, reason: expect.stringMatching(/host to forward to/) })
    expect(forwardPlan(target, [{ ...server, port: '' }])).toMatchObject({ mode: null, reason: expect.stringMatching(/previous node/) })
  })

  it('tolerates a missing previous list', () => {
    expect(forwardPlan(server, undefined).mode).toBe('self')
    expect(forwardPlan(server, null).mode).toBe('self')
  })
})

describe('forwardHint', () => {
  it('describes where the tunnels open', () => {
    expect(forwardHint(forwardPlan(server, []), server)).toBe('Opens tunnels through me@bastion.example.com.')
    expect(forwardHint(forwardPlan(inner, [server]), inner)).toBe('Opens tunnels through me@inner.example.com, via 1 previous node.')
    expect(forwardHint(forwardPlan(inner, [server, server]), inner)).toContain('via 2 previous nodes')
    expect(forwardHint(forwardPlan(target, [server]), target)).toContain('open to db.internal through 1 previous node')
  })

  it('explains why nothing can be opened', () => {
    expect(forwardHint(forwardPlan({ user: '', host: '', port: '' }, []), {})).toMatch(/Enter a user, host and port/)
  })
})

describe('forwardEntries', () => {
  it('fills a blank target host with the default of the mode', () => {
    const forwards = [
      { checked: true, from: '8080', host: null, to: '80' },
      { checked: false, from: '1', host: '  ', to: '2' },
      { checked: true, from: '9', host: ' x.internal ', to: '9' }
    ]

    expect(forwardEntries(forwards, forwardPlan(server, [])).map(x => x.host)).toEqual(['localhost', 'localhost', 'x.internal'])
    expect(forwardEntries(forwards, forwardPlan(target, [server])).map(x => x.host)).toEqual(['db.internal', 'db.internal', 'x.internal'])
  })
})

describe('forwardSummary', () => {
  const forwards = [
    { checked: true, from: '15432', host: 'db.internal', to: '5432' },
    { checked: false, from: '1', host: '', to: '2' },
    { checked: true, from: '8080', host: '', to: '80' }
  ]

  it('is empty without an enabled forward', () => {
    expect(forwardSummary([], forwardPlan(server, []))).toBeNull()
    expect(forwardSummary([{ checked: false, from: '1', to: '2' }], forwardPlan(server, []))).toBeNull()
  })

  it('shows the first enabled forward, the number of the others and all of them in the tooltip', () => {
    const summary = forwardSummary(forwards, forwardPlan(server, []))
    expect(summary.text).toBe(':15432 → db.internal:5432 (+1)')
    expect(summary.title).toBe(':15432 → db.internal:5432\n:8080 → localhost:80')
  })

  it('marks missing ports and uses the default host of the mode', () => {
    const summary = forwardSummary([{ checked: true, from: '', host: '', to: '' }], forwardPlan(target, [server]))
    expect(summary.text).toBe(':? → db.internal:?')
  })
})

describe('activeForwards', () => {
  it('keeps only the enabled ones', () => {
    expect(activeForwards([{ checked: true, from: '1' }, { checked: false, from: '2' }])).toEqual([{ checked: true, from: '1' }])
    expect(activeForwards(undefined)).toEqual([])
  })
})

describe('configRequest', () => {
  const forwards = [{ checked: true, from: '15432', host: '', to: '5432' }, { checked: false, from: '1', to: '2' }]

  it('self: copies the chain including this node and puts the forwards on this node', () => {
    const request = configRequest(inner, [server], forwards, forwardPlan(inner, [server]))
    expect(request.nodes).toEqual([server, inner])
    expect(request.forwards).toEqual([{ checked: true, from: '15432', host: 'localhost', to: '5432' }])
  })

  it('target: copies up to the previous node and forwards to this node\'s host', () => {
    const request = configRequest(target, [server], forwards, forwardPlan(target, [server]))
    expect(request.nodes).toEqual([server])
    expect(request.forwards).toEqual([{ checked: true, from: '15432', host: 'db.internal', to: '5432' }])
  })

  it('cannot forward: copies the chain without forwards', () => {
    const plan = forwardPlan({ ...inner, port: '' }, [])
    const request = configRequest({ ...inner, port: '' }, [], forwards, plan)
    expect(request.nodes).toHaveLength(1)
    expect(request.forwards).toEqual([])
  })
})
