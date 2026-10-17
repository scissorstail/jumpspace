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
    // 처음부터 있어야 바뀔 때 화면이 안다 (terminalUpdate는 있는 객체에 덧쓴다)
    expect(session).toMatchObject({ connected: false, busy: false })
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

  // 탭을 Ctrl+클릭하면 같은 접속을 하나 더 연다 (#257). 요청은 main의 세션에 있다: 새 탭은 그 세션의 id만 갖는다.
  describe('another tab of the same connection', () => {
    const { mutations, getters } = terminal
    const route = [{ user: 'u', host: 'a', port: '22', password: 'secret' }, { user: 'v', host: 'b', port: '2222' }]
    const fresh = () => {
      const state = freshState()
      mutations.terminalOwner(state, 0)
      return state
    }
    // 연 탭: 패널이 요청을 main에 넘기고 세션 id를 받은 뒤의 모양
    const open = (state, title, id) => {
      mutations.terminalAdd(state, { title, kind: 'proxyJump', payload: route, route })
      const key = state.activeKey
      mutations.terminalUpdate(state, { key, request: null, ...(id === undefined ? {} : { id, status: 'running' }) })
      return key
    }
    const order = state => getters.terminalSessions(state).map(x => x.key)

    it('comes right after its tab, with its name and path, takes the keyboard and holds only the id of its session', () => {
      const state = fresh()
      const a = open(state, 'web', 7)
      const b = open(state, 'db', 8)
      mutations.terminalPanel(state, false)

      mutations.terminalDuplicate(state, a)
      const copy = state.sessions[1]
      expect(order(state)).toEqual([a, copy.key, b])
      expect(copy).toEqual({ key: copy.key, id: null, owner: 0, title: 'web', hops: ['u@a:22', 'v@b:2222'], status: 'starting', connected: false, busy: false, exitCode: null, request: { duplicateOf: 7 } })
      expect(copy.key).toBeGreaterThan(b)
      expect(copy.hops).not.toBe(state.sessions[0].hops)
      expect(JSON.stringify(state.sessions)).not.toContain('secret')
      expect(state.activeKey).toBe(copy.key)
      expect(state.isPanelOpen).toBe(true)
    })

    it('works for a tab that ended too: its session id is what main remembered for reconnecting', () => {
      const state = fresh()
      const a = open(state, 'web', 7)
      mutations.terminalUpdate(state, { key: a, status: 'exited', exitCode: 255 })

      mutations.terminalDuplicate(state, a)
      expect(state.sessions.map(x => x.request)).toEqual([null, { duplicateOf: 7 }])
      expect(state.sessions[0]).toMatchObject({ status: 'exited', exitCode: 255, id: 7 })
    })

    it('opens in the row of its tab while the panel is split, and takes the keyboard into that half', () => {
      const state = fresh()
      const a = open(state, 'a', 1)
      const b = open(state, 'b', 2)
      mutations.terminalActivate(state, a)
      mutations.terminalSplit(state, true)
      // 왼쪽: a (고른 탭), 오른쪽: b

      mutations.terminalDuplicate(state, b)
      const bb = state.activeKey
      expect(getters.terminalRightKeys(state)).toEqual([b, bb])
      expect(getters.terminalPanes(state)).toEqual({ left: a, right: bb })

      mutations.terminalDuplicate(state, a)
      const aa = state.activeKey
      expect(getters.terminalRightKeys(state)).toEqual([b, bb])
      expect(getters.terminalPanes(state)).toEqual({ left: aa, right: bb })
      expect(order(state)).toEqual([a, aa, b, bb])
    })

    it('does nothing for a tab without a session in main, a tab of another space, or no tab', () => {
      const state = fresh()
      const a = open(state, 'a')
      const before = JSON.stringify(state)
      mutations.terminalDuplicate(state, a)
      mutations.terminalDuplicate(state, 999)
      expect(JSON.stringify(state)).toBe(before)

      const b = open(state, 'b', 3)
      mutations.terminalOwner(state, 1)
      const away = JSON.stringify(state)
      mutations.terminalDuplicate(state, b)
      expect(JSON.stringify(state)).toBe(away)
    })
  })
})
