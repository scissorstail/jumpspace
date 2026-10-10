import { describe, expect, it, vi } from 'vitest'
import { activeTerminalNode, canReconnect, countByOwner, createOutputRouter, endedByUser, hopKey, INTERRUPT_WINDOW_MS, reorderSessions, rightClickAction, routeStates, sessionPhase, sessionsOf, terminalShortcut, terminalTitle } from './terminal-sessions'

describe('terminalTitle', () => {
  it('names a tab after the node', () => {
    expect(terminalTitle('connect', { name: 'db', host: '10.0.0.5' })).toBe('db')
    expect(terminalTitle('connect', { name: '', host: '10.0.0.5' })).toBe('10.0.0.5')
    expect(terminalTitle('connect', {})).toBe('ssh')
  })

  it('marks forwards and jumps', () => {
    expect(terminalTitle('forward', { name: 'db' })).toBe('⇄ db')
    expect(terminalTitle('proxyJump', { name: 'db' }, 2)).toBe('db (+2)')
    expect(terminalTitle('proxyJump', { name: 'db' }, 0)).toBe('db')
  })
})

describe('createOutputRouter', () => {
  it('sends output to the tab of its session', () => {
    const router = createOutputRouter()
    const a = vi.fn()
    const b = vi.fn()
    router.register(1, a)
    router.register(2, b)

    router.push(1, 'x')
    router.push(2, 'y')

    expect(a).toHaveBeenCalledWith('x')
    expect(b).toHaveBeenCalledWith('y')
  })

  it('keeps output that arrives before the tab knows its id, and hands it over once', () => {
    const router = createOutputRouter()
    router.push(5, 'hel')
    router.push(5, 'lo')

    const write = vi.fn()
    router.register(5, write)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('hello')

    router.push(5, '!')
    expect(write).toHaveBeenLastCalledWith('!')
  })

  it('bounds what it keeps, and forgets a closed session', () => {
    const router = createOutputRouter({ maxPending: 4 })
    router.push(1, 'abcdef')
    const write = vi.fn()
    router.register(1, write)
    expect(write).toHaveBeenCalledWith('cdef')

    router.unregister(1)
    router.push(1, 'late')
    router.push(1, 'r')
    const again = vi.fn()
    router.register(1, again)
    expect(again).toHaveBeenCalledWith('ater') // 'later'을 4자로 자른 것
    expect(write).toHaveBeenCalledTimes(1)
  })
})

describe('hopKey', () => {
  it('identifies a server by user, host and port only', () => {
    expect(hopKey({ user: 'deploy', host: 'web', port: '22', password: 'secret', keyPath: '/k' })).toBe('deploy@web:22')
    expect(hopKey({ user: ' deploy ', host: 'web', port: 22 })).toBe('deploy@web:22')
    expect(hopKey({ host: 'db.internal' })).toBe('@db.internal:')
    expect(hopKey(null)).toBe('@:')
  })
})

describe('sessions of a diagram', () => {
  const sessions = [{ key: 1, owner: 0 }, { key: 2, owner: 3 }, { key: 3, owner: 0 }, { key: 4, owner: null }]

  it('keeps only the sessions the item opened, in order', () => {
    expect(sessionsOf(sessions, 0).map(x => x.key)).toEqual([1, 3])
    expect(sessionsOf(sessions, 3).map(x => x.key)).toEqual([2])
    expect(sessionsOf(sessions, 7)).toEqual([])
    expect(sessionsOf(undefined, 0)).toEqual([])
  })

  // item 번호 0과 "열린 item 없음"(null)은 다르다.
  it('does not mix up item 0 with no item', () => {
    expect(sessionsOf(sessions, null).map(x => x.key)).toEqual([4])
  })

  it('counts the open tabs of every item', () => {
    const counts = countByOwner(sessions)

    expect(counts.get(0)).toBe(2)
    expect(counts.get(3)).toBe(1)
    expect(counts.get(7)).toBeUndefined()
    expect(countByOwner(undefined).size).toBe(0)
  })
})

describe('reorderSessions', () => {
  const sessions = [{ key: 1, owner: 0 }, { key: 2, owner: 3 }, { key: 3, owner: 0 }, { key: 4, owner: 0 }]
  const keys = list => list.map(x => x.key)

  it('puts the dragged tabs in their new order', () => {
    expect(keys(reorderSessions(sessions, [4, 1, 3]))).toEqual([4, 2, 1, 3])
  })

  // 다른 item의 세션(2)은 보이지 않는 채로 제자리에 남는다.
  it('leaves the sessions of other diagrams where they are', () => {
    const result = reorderSessions(sessions, [3, 4, 1])

    expect(keys(result)).toEqual([3, 2, 4, 1])
    expect(result[1]).toBe(sessions[1])
  })

  it('ignores keys that are unknown or repeated, and does not change the input', () => {
    expect(keys(reorderSessions(sessions, [3, 99, 3, 1]))).toEqual([3, 2, 1, 4])
    expect(keys(reorderSessions(sessions, []))).toEqual([1, 2, 3, 4])
    expect(keys(sessions)).toEqual([1, 2, 3, 4])
  })
})

describe('sessionPhase', () => {
  it('is connecting until the login marker arrived, then connected', () => {
    expect(sessionPhase({ status: 'starting' })).toBe('connecting')
    expect(sessionPhase({ status: 'running', connected: false })).toBe('connecting')
    expect(sessionPhase({ status: 'running', connected: true })).toBe('connected')
  })

  it('is failed when it could not start or ssh itself failed, and nothing after a normal end', () => {
    expect(sessionPhase({ status: 'failed' })).toBe('failed')
    expect(sessionPhase({ status: 'exited', exitCode: 255 })).toBe('failed')
    expect(sessionPhase({ status: 'exited', exitCode: 0 })).toBeNull()
    // 셸의 마지막 명령이 정한 종료 코드다 (ssh 오류가 아니다)
    expect(sessionPhase({ status: 'exited', exitCode: 1 })).toBeNull()
    expect(sessionPhase(null)).toBeNull()
  })
})

describe('routeStates', () => {
  const a = 'u@a:22'
  const b = 'u@b:22'
  const c = 'u@c:22'

  it('marks the nodes and the links along every session with its phase', () => {
    const { nodes, links } = routeStates([
      { status: 'running', connected: true, hops: [a, b, c] },
      { status: 'exited', exitCode: 255, hops: [c] }
    ])

    expect(Object.fromEntries(nodes)).toEqual({ [a]: 'connected', [b]: 'connected', [c]: 'connected' })
    expect(Object.fromEntries(links)).toEqual({ [`${a}>${b}`]: 'connected', [`${b}>${c}`]: 'connected' })
  })

  it('shows the best phase where routes share a node: connected, then connecting, then failed', () => {
    const { nodes } = routeStates([
      { status: 'exited', exitCode: 255, hops: [a, b] },
      { status: 'starting', hops: [a] },
      { status: 'failed', hops: [c] }
    ])

    expect(Object.fromEntries(nodes)).toEqual({ [a]: 'connecting', [b]: 'failed', [c]: 'failed' })
  })

  it('ignores sessions that ended normally and sessions without a route', () => {
    const { nodes, links } = routeStates([
      { status: 'exited', exitCode: 0, hops: [a, b] },
      { status: 'running', connected: true }
    ])

    expect(nodes.size).toBe(0)
    expect(links.size).toBe(0)
    expect(routeStates(undefined).links.size).toBe(0)
  })

  it('keeps the direction of a link', () => {
    const { links } = routeStates([{ status: 'running', connected: true, hops: [a, b] }])

    expect(links.has(`${a}>${b}`)).toBe(true)
    expect(links.has(`${b}>${a}`)).toBe(false)
  })
})

describe('activeTerminalNode', () => {
  const a = 'u@a:22'
  const b = 'u@b:22'
  const c = 'u@c:22'
  const sessions = [
    { key: 1, status: 'running', connected: true, hops: [a] },
    { key: 2, status: 'running', connected: true, hops: [a, b, c] },
    { key: 3, status: 'exited', exitCode: 255, hops: [a, b] }
  ]

  // Connect는 노드 하나, ProxyJump와 포워딩은 앞 노드들 다음에 그 노드가 온다.
  it('is the last hop of the selected tab: the node it was opened from', () => {
    expect(activeTerminalNode(sessions, 1)).toBe(a)
    expect(activeTerminalNode(sessions, 2)).toBe(c)
  })

  it('follows the selected tab, also when its session has ended', () => {
    expect(activeTerminalNode(sessions, 3)).toBe(b)
  })

  it('is nothing while the panel is hidden', () => {
    expect(activeTerminalNode(sessions, 2, false)).toBe(null)
    expect(activeTerminalNode(sessions, 2, true)).toBe(c)
  })

  it('is nothing without a selected tab or without a route', () => {
    expect(activeTerminalNode(sessions, null)).toBe(null)
    expect(activeTerminalNode(sessions, 9)).toBe(null)
    expect(activeTerminalNode([{ key: 1, hops: [] }, { key: 2 }], 1)).toBe(null)
    expect(activeTerminalNode([{ key: 1, hops: [] }, { key: 2 }], 2)).toBe(null)
    expect(activeTerminalNode(undefined, 1)).toBe(null)
  })
})

describe('rightClickAction', () => {
  it('copies the selected text, or pastes when nothing is selected', () => {
    expect(rightClickAction({ hasSelection: true })).toBe('copy')
    expect(rightClickAction({ hasSelection: false })).toBe('paste')
    expect(rightClickAction()).toBe('paste')
    expect(rightClickAction({ mouseTracking: 'none', shiftKey: true, hasSelection: true })).toBe('copy')
  })

  it('leaves the click to a program that asked for the mouse, unless Shift is held', () => {
    for (const mouseTracking of ['x10', 'vt200', 'drag', 'any']) {
      expect(rightClickAction({ mouseTracking })).toBe('program')
      expect(rightClickAction({ mouseTracking, hasSelection: true })).toBe('program')
      expect(rightClickAction({ mouseTracking, shiftKey: true })).toBe('paste')
      expect(rightClickAction({ mouseTracking, shiftKey: true, hasSelection: true })).toBe('copy')
    }
  })
})

describe('terminalShortcut', () => {
  const key = (code, mods = {}, key = '') => ({ type: 'keydown', code, key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods })

  it('copies with Ctrl+Shift+C and Ctrl+Insert', () => {
    expect(terminalShortcut(key('KeyC', { ctrlKey: true, shiftKey: true }, 'C'))).toBe('copy')
    expect(terminalShortcut(key('Insert', { ctrlKey: true }, 'Insert'))).toBe('copy')
  })

  it('copies with Ctrl+C only while text is selected, so it still interrupts otherwise', () => {
    expect(terminalShortcut(key('KeyC', { ctrlKey: true }, 'c'), { hasSelection: true })).toBe('copy')
    expect(terminalShortcut(key('KeyC', { ctrlKey: true }, 'c'), { hasSelection: false })).toBe(null)
    expect(terminalShortcut(key('KeyC', { ctrlKey: true }, 'c'))).toBe(null)
  })

  it('pastes with Ctrl+V and Ctrl+Shift+V, selected text or not', () => {
    expect(terminalShortcut(key('KeyV', { ctrlKey: true }, 'v'))).toBe('paste')
    expect(terminalShortcut(key('KeyV', { ctrlKey: true, shiftKey: true }, 'V'))).toBe('paste')
    expect(terminalShortcut(key('KeyV', { ctrlKey: true }, 'v'), { hasSelection: true })).toBe('paste')
    expect(terminalShortcut(key('KeyV', {}, 'v'))).toBe(null)
    expect(terminalShortcut(key('KeyV', { ctrlKey: true, altKey: true }, 'v'))).toBe(null)
  })

  it('leaves Ctrl+C (interrupt), plain keys, other modifiers and key-up alone', () => {
    expect(terminalShortcut(key('KeyC', { ctrlKey: true }, 'c'))).toBe(null)
    expect(terminalShortcut(key('KeyC', { shiftKey: true }, 'C'))).toBe(null)
    expect(terminalShortcut(key('KeyC', { ctrlKey: true, shiftKey: true, altKey: true }, 'C'))).toBe(null)
    expect(terminalShortcut(key('Insert', { shiftKey: true }, 'Insert'))).toBe(null)
    expect(terminalShortcut({ ...key('KeyC', { ctrlKey: true, shiftKey: true }, 'C'), type: 'keyup' })).toBe(null)
    expect(terminalShortcut(undefined)).toBe(null)
  })
})

describe('canReconnect', () => {
  it('is true only for a session that ran and ended', () => {
    expect(canReconnect({ status: 'exited', id: 3 })).toBe(true)
    expect(canReconnect({ status: 'exited', id: 3, exitCode: 255 })).toBe(true)
    expect(canReconnect({ status: 'running', id: 3 })).toBe(false)
    expect(canReconnect({ status: 'starting', id: null })).toBe(false)
    expect(canReconnect({ status: 'failed', id: null })).toBe(false)
    expect(canReconnect({ status: 'exited', id: null })).toBe(false)
    expect(canReconnect(null)).toBe(false)
  })
})

describe('endedByUser', () => {
  const now = 100000

  it('closes a session the user logged out of, whatever the shell returned', () => {
    expect(endedByUser({ exitCode: 0, connected: true, now })).toBe(true)
    expect(endedByUser({ exitCode: 3, connected: true, now })).toBe(true)
  })

  it('keeps a session that ssh ended by itself (refused, auth failed, connection lost)', () => {
    expect(endedByUser({ exitCode: 255, connected: false, now })).toBe(false)
    expect(endedByUser({ exitCode: 255, connected: true, now })).toBe(false)
  })

  it('closes a forward stopped with Ctrl+C (ssh -N also returns 255), but only right after it', () => {
    expect(endedByUser({ exitCode: 255, connected: true, interruptedAt: now - 500, now })).toBe(true)
    expect(endedByUser({ exitCode: 255, connected: true, interruptedAt: now - INTERRUPT_WINDOW_MS, now })).toBe(true)
    expect(endedByUser({ exitCode: 255, connected: true, interruptedAt: now - INTERRUPT_WINDOW_MS - 1, now })).toBe(false)
  })

  it('closes a connection cancelled with Ctrl+C while connecting', () => {
    expect(endedByUser({ exitCode: 130, connected: false, now })).toBe(true)
  })

  it('keeps a session that ended before logging in, so its error stays readable', () => {
    expect(endedByUser({ exitCode: 127, connected: false, now })).toBe(false)
    expect(endedByUser({ exitCode: 0, connected: false, now })).toBe(false)
  })
})
