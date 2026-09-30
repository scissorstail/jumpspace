import { describe, expect, it } from 'vitest'
import terminal from './terminal'

function freshState() {
  return JSON.parse(JSON.stringify(terminal.state))
}

describe('terminal store', () => {
  it('keeps the route of a session as hop keys, without passwords', () => {
    const state = freshState()
    const route = [{ user: 'u', host: 'a', port: '22', password: 'secret' }, { user: 'v', host: 'b', port: '2222' }]

    terminal.mutations.terminalAdd(state, { title: 'b', kind: 'proxyJump', payload: route, route })
    const [session] = state.sessions

    expect(session.hops).toEqual(['u@a:22', 'v@b:2222'])
    expect(JSON.stringify(session.hops)).not.toContain('secret')
    expect(session.status).toBe('starting')
    expect(state.isPanelOpen).toBe(true)
  })

  it('has an empty route when none is given', () => {
    const state = freshState()
    terminal.mutations.terminalAdd(state, { title: 'x', kind: 'connect', payload: {} })

    expect(state.sessions[0].hops).toEqual([])
  })
})
