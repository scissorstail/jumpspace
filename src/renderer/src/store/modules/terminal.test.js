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

  // 터미널은 그것을 연 다이어그램(item)의 것이다.
  describe('terminals belong to the diagram that opened them', () => {
    const { mutations, getters } = terminal
    const open = (state, title) => mutations.terminalAdd(state, { title, kind: 'connect', payload: {} })
    const titles = state => getters.terminalSessions(state).map(x => x.title)

    it('shows only the tabs of the open diagram and keeps the others running', () => {
      const state = freshState()
      mutations.terminalOwner(state, 0)
      open(state, 'a1')
      open(state, 'a2')

      mutations.terminalOwner(state, 1)
      expect(titles(state)).toEqual([])
      expect(state.isPanelOpen).toBe(false)
      expect(state.activeKey).toBeNull()
      expect(getters.allTerminalSessions(state)).toHaveLength(2)

      open(state, 'b1')
      expect(titles(state)).toEqual(['b1'])

      mutations.terminalOwner(state, 0)
      expect(titles(state)).toEqual(['a1', 'a2'])
      expect(state.isPanelOpen).toBe(true)
    })

    it('comes back to the tab that was active and to a hidden panel', () => {
      const state = freshState()
      mutations.terminalOwner(state, 0)
      open(state, 'a1')
      open(state, 'a2')
      const [a1] = state.sessions
      mutations.terminalActivate(state, a1.key)
      mutations.terminalPanel(state, false)

      mutations.terminalOwner(state, 1)
      open(state, 'b1')
      mutations.terminalOwner(state, 0)

      expect(state.activeKey).toBe(a1.key)
      expect(state.isPanelOpen).toBe(false)
    })

    it('shows no tabs while no diagram is open', () => {
      const state = freshState()
      mutations.terminalOwner(state, 0)
      open(state, 'a1')

      mutations.terminalOwner(state, null)

      expect(titles(state)).toEqual([])
      expect(state.isPanelOpen).toBe(false)
    })

    it('moves to a neighbour of the same diagram when a tab closes', () => {
      const state = freshState()
      mutations.terminalOwner(state, 0)
      open(state, 'a1')
      mutations.terminalOwner(state, 1)
      open(state, 'b1')
      mutations.terminalOwner(state, 0)
      open(state, 'a2')
      const [a1, , a2] = state.sessions

      mutations.terminalRemove(state, a2.key)
      expect(state.activeKey).toBe(a1.key)

      mutations.terminalRemove(state, a1.key)
      expect(state.activeKey).toBeNull()
      expect(state.isPanelOpen).toBe(false)
      expect(getters.allTerminalSessions(state).map(x => x.title)).toEqual(['b1'])
    })

    it('reorders the tabs of the open diagram and keeps the active tab', () => {
      const state = freshState()
      mutations.terminalOwner(state, 0)
      open(state, 'a1')
      mutations.terminalOwner(state, 1)
      open(state, 'b1')
      mutations.terminalOwner(state, 0)
      open(state, 'a2')
      const [a1, , a2] = state.sessions

      mutations.terminalReorder(state, [a2.key, a1.key])

      expect(titles(state)).toEqual(['a2', 'a1'])
      expect(state.activeKey).toBe(a2.key)
      mutations.terminalOwner(state, 1)
      expect(titles(state)).toEqual(['b1'])
    })

    it('leaves the visible panel alone when a tab of another diagram ends', () => {
      const state = freshState()
      mutations.terminalOwner(state, 0)
      open(state, 'a1')
      mutations.terminalOwner(state, 1)
      open(state, 'b1')
      const [a1, b1] = state.sessions

      mutations.terminalRemove(state, a1.key)

      expect(state.activeKey).toBe(b1.key)
      expect(state.isPanelOpen).toBe(true)
      // 돌아가면 남은 탭이 없으므로 패널도 없다
      mutations.terminalOwner(state, 0)
      expect(state.activeKey).toBeNull()
      expect(state.isPanelOpen).toBe(false)
    })
  })

  // 최대화: 패널이 헤더 아래까지 올라가서 캔버스 자리를 차지한다.
  describe('maximized panel', () => {
    const { mutations, getters } = terminal
    const open = (state, title) => mutations.terminalAdd(state, { title, kind: 'connect', payload: {} })
    const isMaximized = state => getters.isTerminalPanelMaximized(state)

    it('takes the place of the canvas only while the panel is shown', () => {
      const state = freshState()
      mutations.terminalOwner(state, 0)
      expect(isMaximized(state)).toBe(false)
      open(state, 'a1')
      expect(isMaximized(state)).toBe(false)

      mutations.terminalMaximize(state, true)
      expect(isMaximized(state)).toBe(true)

      // 숨기면 캔버스가 보이고, 다시 보이면 최대화한 채로 돌아온다
      mutations.terminalPanel(state, false)
      expect(isMaximized(state)).toBe(false)
      mutations.terminalPanel(state, true)
      expect(isMaximized(state)).toBe(true)

      mutations.terminalMaximize(state, false)
      expect(isMaximized(state)).toBe(false)
      expect(state.isPanelOpen).toBe(true)
    })

    it('is remembered for each diagram', () => {
      const state = freshState()
      mutations.terminalOwner(state, 0)
      open(state, 'a1')
      mutations.terminalMaximize(state, true)

      mutations.terminalOwner(state, 1)
      expect(isMaximized(state)).toBe(false)
      open(state, 'b1')
      expect(isMaximized(state)).toBe(false)

      mutations.terminalOwner(state, 0)
      expect(isMaximized(state)).toBe(true)
      mutations.terminalOwner(state, 1)
      expect(isMaximized(state)).toBe(false)
    })

    it('ends when the last tab of the diagram closes', () => {
      const state = freshState()
      mutations.terminalOwner(state, 0)
      open(state, 'a1')
      open(state, 'a2')
      const [a1, a2] = state.sessions
      mutations.terminalMaximize(state, true)

      mutations.terminalRemove(state, a2.key)
      expect(isMaximized(state)).toBe(true)

      mutations.terminalRemove(state, a1.key)
      expect(isMaximized(state)).toBe(false)
      // 다음 터미널은 캔버스 아래에서 열린다
      open(state, 'a3')
      expect(state.isPanelOpen).toBe(true)
      expect(isMaximized(state)).toBe(false)
    })

    it('is not touched by a tab of another diagram, and is gone when its own tabs ended meanwhile', () => {
      const state = freshState()
      mutations.terminalOwner(state, 0)
      open(state, 'a1')
      mutations.terminalMaximize(state, true)
      mutations.terminalOwner(state, 1)
      open(state, 'b1')
      mutations.terminalMaximize(state, true)
      const [a1] = state.sessions

      mutations.terminalRemove(state, a1.key)
      expect(isMaximized(state)).toBe(true)

      mutations.terminalOwner(state, 0)
      expect(isMaximized(state)).toBe(false)
      open(state, 'a2')
      expect(isMaximized(state)).toBe(false)
    })
  })

  it('has an empty route when none is given', () => {
    const state = freshState()
    terminal.mutations.terminalAdd(state, { title: 'x', kind: 'connect', payload: {} })

    expect(state.sessions[0].hops).toEqual([])
  })
})
