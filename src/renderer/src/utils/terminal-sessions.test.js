import { describe, expect, it, vi } from 'vitest'
import { createOutputRouter, hopKey, liveRoutes, terminalTitle } from './terminal-sessions'

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

describe('liveRoutes', () => {
  const a = 'u@a:22'
  const b = 'u@b:22'
  const c = 'u@c:22'

  it('marks the nodes and the links along every open session', () => {
    const { nodes, links } = liveRoutes([
      { status: 'running', hops: [a, b, c] },
      { status: 'starting', hops: [a] }
    ])

    expect([...nodes].sort()).toEqual([a, b, c])
    expect([...links].sort()).toEqual([`${a}>${b}`, `${b}>${c}`])
  })

  it('ignores ended and failed sessions, and sessions without a route', () => {
    const { nodes, links } = liveRoutes([
      { status: 'exited', hops: [a, b] },
      { status: 'failed', hops: [b, c] },
      { status: 'running' }
    ])

    expect(nodes.size).toBe(0)
    expect(links.size).toBe(0)
    expect(liveRoutes(undefined).links.size).toBe(0)
  })

  it('keeps the direction of a link', () => {
    const { links } = liveRoutes([{ status: 'running', hops: [a, b] }])

    expect(links.has(`${a}>${b}`)).toBe(true)
    expect(links.has(`${b}>${a}`)).toBe(false)
  })
})
