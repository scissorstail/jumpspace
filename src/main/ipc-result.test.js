import { afterEach, describe, expect, it, vi } from 'vitest'
import { toResult } from './ipc-result.js'

describe('toResult', () => {
  afterEach(() => vi.restoreAllMocks())

  it('answers ok with the values the work returned', async () => {
    expect(await toResult('x', async () => {})).toEqual({ ok: true })
    expect(await toResult('x', async () => ({ id: 7 }))).toEqual({ ok: true, id: 7 })
    expect(await toResult('x', () => ({ id: 8 }))).toEqual({ ok: true, id: 8 })
  })

  it('turns a failure into ok: false with its message and logs it under the label', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await toResult('ssh:connect', async () => { throw new Error('bash.exe was not found') }))
      .toEqual({ ok: false, error: 'bash.exe was not found' })
    expect(log).toHaveBeenCalledWith('ssh:connect failed:', expect.any(Error))
    expect(await toResult('x', () => { throw 'plain' })).toEqual({ ok: false, error: 'plain' }) // eslint-disable-line no-throw-literal
  })
})
