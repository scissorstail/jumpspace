import { describe, expect, it, vi } from 'vitest'
import { canReconnect, createOutputRouter, hopKey, routeStates, sessionPhase, terminalShortcut, terminalTitle } from './terminal-sessions'

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

describe('terminalShortcut', () => {
  const key = (code, mods = {}, key = '') => ({ type: 'keydown', code, key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods })

  it('copies with Ctrl+Shift+C and Ctrl+Insert', () => {
    expect(terminalShortcut(key('KeyC', { ctrlKey: true, shiftKey: true }, 'C'))).toBe('copy')
    expect(terminalShortcut(key('Insert', { ctrlKey: true }, 'Insert'))).toBe('copy')
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
