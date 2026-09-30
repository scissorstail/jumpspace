import { describe, expect, it, vi } from 'vitest'
import { createOutputRouter, terminalTitle } from './terminal-sessions'

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
