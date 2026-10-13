import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuitHold, QUIT_WAIT_LIMIT_MS } from './quit-hold.js'

// 손으로 끝내는 "저장" 하나와, will-quit의 event
function setup({ isBusy = true } = {}) {
  let release
  const work = new Promise(resolve => { release = resolve })
  const state = { isBusy }
  const quit = vi.fn()
  const hold = createQuitHold({ isBusy: () => state.isBusy, settled: () => work, quit })

  return {
    quit,
    hold,
    event: () => ({ preventDefault: vi.fn() }),
    // 저장이 끝난다
    async finishSave() {
      state.isBusy = false
      release()
      await vi.advanceTimersByTimeAsync(0)
    }
  }
}

describe('holding the end of the app while a save has not ended', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('lets the app end at once when nothing is being saved', async () => {
    const { hold, event, quit } = setup({ isBusy: false })
    const willQuit = event()

    hold(willQuit)
    await vi.advanceTimersByTimeAsync(QUIT_WAIT_LIMIT_MS)

    expect(willQuit.preventDefault).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
  })

  it('holds the end while a save has not ended, and ends the app when it has', async () => {
    const { hold, event, quit, finishSave } = setup()
    const willQuit = event()

    hold(willQuit)
    expect(willQuit.preventDefault).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1500)
    expect(quit).not.toHaveBeenCalled()

    await finishSave()
    expect(quit).toHaveBeenCalledTimes(1)

    // 다시 온 끝내기는 막지 않는다. 한계를 재던 타이머도 남지 않았다.
    const again = event()
    hold(again)
    await vi.advanceTimersByTimeAsync(QUIT_WAIT_LIMIT_MS)
    expect(again.preventDefault).not.toHaveBeenCalled()
    expect(quit).toHaveBeenCalledTimes(1)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('ends the app once, however often it is told to end while it waits', async () => {
    const { hold, event, quit, finishSave } = setup()
    const events = [event(), event(), event()]

    events.forEach(willQuit => hold(willQuit))
    expect(events.map(willQuit => willQuit.preventDefault.mock.calls.length)).toEqual([1, 1, 1])

    await finishSave()
    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('ends the app when the save failed, too', async () => {
    const quit = vi.fn()
    const hold = createQuitHold({ isBusy: () => true, settled: () => Promise.reject(new Error('disk')), quit })

    hold({ preventDefault: vi.fn() })
    await vi.advanceTimersByTimeAsync(0)

    expect(quit).toHaveBeenCalledTimes(1)
  })

  // 멈춘 디스크: 창 없는 앱이 남으면 안 된다
  it('does not wait for ever: after the limit the app ends, and the next end is not held', async () => {
    const { hold, event, quit } = setup()

    hold(event())
    await vi.advanceTimersByTimeAsync(QUIT_WAIT_LIMIT_MS - 1)
    expect(quit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledTimes(1)

    // 저장은 아직 끝나지 않았다. 그래도 다시 온 끝내기는 막지 않는다.
    const again = event()
    hold(again)
    expect(again.preventDefault).not.toHaveBeenCalled()
  })

  it('a save that ends after the limit does not end the app a second time', async () => {
    const { hold, event, quit, finishSave } = setup()

    hold(event())
    await vi.advanceTimersByTimeAsync(QUIT_WAIT_LIMIT_MS)
    await finishSave()

    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('holds again for a later save, and the limit of the first wait does not cut the second one short', async () => {
    const works = []
    const state = { isBusy: true }
    const quit = vi.fn()
    const hold = createQuitHold({ isBusy: () => state.isBusy, settled: () => new Promise(resolve => works.push(resolve)), quit })

    hold({ preventDefault: vi.fn() })
    await vi.advanceTimersByTimeAsync(1000)
    state.isBusy = false
    works[0]()
    await vi.advanceTimersByTimeAsync(0)
    expect(quit).toHaveBeenCalledTimes(1)

    // 끝나는 길에 저장이 또 있다 (있을 법하지 않지만, 있으면 그것도 기다린다)
    state.isBusy = true
    const willQuit = { preventDefault: vi.fn() }
    hold(willQuit)
    expect(willQuit.preventDefault).toHaveBeenCalledTimes(1)
    // 첫 기다림의 한계였을 때를 지난다
    await vi.advanceTimersByTimeAsync(QUIT_WAIT_LIMIT_MS - 500)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(console.error).not.toHaveBeenCalled()

    state.isBusy = false
    works[1]()
    await vi.advanceTimersByTimeAsync(0)
    expect(quit).toHaveBeenCalledTimes(2)
  })

  it('takes the limit it is given', async () => {
    const quit = vi.fn()
    const hold = createQuitHold({ isBusy: () => true, settled: () => new Promise(() => {}), quit, limitMs: 200 })

    hold({ preventDefault: vi.fn() })
    await vi.advanceTimersByTimeAsync(199)
    expect(quit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(quit).toHaveBeenCalledTimes(1)
  })

  // storage.js는 거절된 rename을 1.5초쯤 다시 한다: 그것보다는 길고, 닫은 앱이 오래 남지는 않게
  it('waits longer than the rename is tried again, and a few seconds at most', () => {
    expect(QUIT_WAIT_LIMIT_MS).toBeGreaterThanOrEqual(3000)
    expect(QUIT_WAIT_LIMIT_MS).toBeLessThanOrEqual(10000)
  })

  // index.js는 Electron 없이 불러올 수 없어서 소스를 읽는다
  it('is what main does before it ends, with the saves of the projects', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8')

    expect(source).toMatch(/app\.on\('will-quit', createQuitHold\(\{ isBusy: projects\.isSaving, settled: projects\.settled, quit: \(\) => app\.quit\(\) \}\)\)/)
  })
})
