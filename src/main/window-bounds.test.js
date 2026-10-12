import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOUNDS_SAVE_DELAY_MS, createBoundsSaver, createWindowStore, DEFAULT_SIZE, MIN_SIZE, restoreBounds } from './window-bounds.js'

const fresh = { width: 1024, height: 768, isMaximized: false }
// 왼쪽에 주 화면, 오른쪽에 둘째 화면 (작업 표시줄 40px을 뺀 영역)
const main = { x: 0, y: 0, width: 1920, height: 1040 }
const second = { x: 1920, y: 0, width: 1280, height: 984 }

describe('restoreBounds', () => {
  it('is the default size, placed by Electron, when nothing usable is stored', () => {
    expect(DEFAULT_SIZE).toEqual({ width: 1024, height: 768 })
    for (const saved of [undefined, null, {}, 'x', 7, { width: 1200, height: 800 }, { x: 10, y: 10, width: '1200', height: 800 }, { x: NaN, y: 10, width: 1200, height: 800 }, { x: 10, y: Infinity, width: 1200, height: 800 }]) {
      expect(restoreBounds(saved, [main])).toEqual(fresh)
    }
    expect(restoreBounds({ x: 10, y: 10, width: 1200, height: 800 }, [])).toEqual(fresh)
    expect(restoreBounds({ x: 10, y: 10, width: 1200, height: 800 })).toEqual(fresh)
  })

  it('puts the window back where it was, at its size', () => {
    expect(restoreBounds({ x: 100, y: 60, width: 1400, height: 900, isMaximized: false }, [main])).toEqual({ x: 100, y: 60, width: 1400, height: 900, isMaximized: false })
    expect(restoreBounds({ x: 2000, y: 40, width: 1000, height: 700 }, [main, second])).toEqual({ x: 2000, y: 40, width: 1000, height: 700, isMaximized: false })
    expect(restoreBounds({ x: 100.4, y: 59.6, width: 1400.5, height: 900.2 }, [main])).toEqual({ x: 100, y: 60, width: 1401, height: 900, isMaximized: false })
  })

  it('remembers that the window was maximized, with the size to go back to', () => {
    expect(restoreBounds({ x: 100, y: 60, width: 1400, height: 900, isMaximized: true }, [main])).toEqual({ x: 100, y: 60, width: 1400, height: 900, isMaximized: true })
    expect(restoreBounds({ x: 100, y: 60, width: 1400, height: 900, isMaximized: 'yes' }, [main]).isMaximized).toBe(false)
    // 자리를 쓸 수 없으면 최대화도 잊는다
    expect(restoreBounds({ x: 5000, y: 60, width: 1400, height: 900, isMaximized: true }, [main])).toEqual(fresh)
  })

  it('does not trust a window that is too small', () => {
    expect(MIN_SIZE).toEqual({ width: 400, height: 300 })
    expect(restoreBounds({ x: 10, y: 10, width: 399, height: 800 }, [main])).toEqual(fresh)
    expect(restoreBounds({ x: 10, y: 10, width: 800, height: 299 }, [main])).toEqual(fresh)
    expect(restoreBounds({ x: 10, y: 10, width: 400, height: 300 }, [main])).toEqual({ x: 10, y: 10, width: 400, height: 300, isMaximized: false })
  })

  // 둘째 모니터에 있던 창: 그 모니터가 없으면 잡을 수 없는 곳에 뜬다
  it('starts fresh when the title bar would be on no screen', () => {
    expect(restoreBounds({ x: 2000, y: 40, width: 1000, height: 700 }, [main])).toEqual(fresh)
    expect(restoreBounds({ x: 100, y: -200, width: 1000, height: 700 }, [main])).toEqual(fresh)
    expect(restoreBounds({ x: 100, y: 1020, width: 1000, height: 700 }, [main])).toEqual(fresh)
    // 제목 줄이 100px은 화면 안에 있어야 한다
    expect(restoreBounds({ x: 1821, y: 40, width: 1000, height: 700 }, [main])).toEqual(fresh)
    expect(restoreBounds({ x: 1820, y: 40, width: 1000, height: 700 }, [main]).x).toBe(1820)
    expect(restoreBounds({ x: -901, y: 40, width: 1000, height: 700 }, [main])).toEqual(fresh)
    expect(restoreBounds({ x: -900, y: 40, width: 1000, height: 700 }, [main]).x).toBe(-900)
  })

  // 화면 가장자리에 붙인 창은 Windows에서 몇 픽셀 밖에 있다
  it('accepts a window snapped to the edge of a screen', () => {
    expect(restoreBounds({ x: -7, y: 0, width: 974, height: 1047 }, [main])).toEqual({ x: -7, y: 0, width: 974, height: 1040, isMaximized: false })
    expect(restoreBounds({ x: 0, y: -10, width: 900, height: 700 }, [main]).y).toBe(-10)
    expect(restoreBounds({ x: 0, y: -11, width: 900, height: 700 }, [main])).toEqual(fresh)
    expect(restoreBounds({ x: 0, y: 1008, width: 900, height: 700 }, [main]).y).toBe(1008)
    expect(restoreBounds({ x: 0, y: 1009, width: 900, height: 700 }, [main])).toEqual(fresh)
  })

  it('is no larger than the screen it is on', () => {
    expect(restoreBounds({ x: 1930, y: 10, width: 1900, height: 1000 }, [main, second])).toEqual({ x: 1930, y: 10, width: 1280, height: 984, isMaximized: false })
  })
})

describe('createWindowStore', () => {
  const fakeStore = initial => {
    const data = new Map(initial === undefined ? [] : [['window', initial]])
    return { get: key => data.get(key), set: (key, value) => data.set(key, value), data }
  }

  it('reads nothing when nothing is stored or the store fails', () => {
    expect(createWindowStore(fakeStore()).get()).toBe(null)
    expect(createWindowStore({ get() { throw new Error('broken file') } }).get()).toBe(null)
  })

  it('stores the place, the size and whether the window is maximized under "window", and reads them back', () => {
    const store = fakeStore()
    const windows = createWindowStore(store)
    windows.set({ x: 5, y: 6, width: 700, height: 500, extra: 1 }, 1)

    expect(store.data.get('window')).toEqual({ x: 5, y: 6, width: 700, height: 500, isMaximized: true })
    expect(windows.get()).toEqual({ x: 5, y: 6, width: 700, height: 500, isMaximized: true })
    expect(restoreBounds(windows.get(), [main])).toEqual({ x: 5, y: 6, width: 700, height: 500, isMaximized: true })
  })
})

// main/index.js는 Electron 없이 돌릴 수 없다: 소스에서 읽는다.
describe('the window of the app', () => {
  const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8').replace(/\r\n/g, '\n')

  it('opens where it was, from the screens that are there now', () => {
    expect(index).toMatch(/const \{ isMaximized, \.\.\.bounds \} = restoreBounds\(windows\.get\(\), screen\.getAllDisplays\(\)\.map\(display => display\.workArea\)\)/)
    expect(index).toMatch(/win = new BrowserWindow\(\{\n\s+\.\.\.bounds,\n/)
    expect(index).toMatch(/if \(isMaximized\) win\.maximize\(\)\n\s+win\.show\(\)/)
  })

  it('saves a moment after it is moved or resized, at once when it closes, and drops a waiting save when it is gone', () => {
    expect(index).toMatch(/const saver = createBoundsSaver\(target, windows\)\n\s+for \(const name of \['resize', 'move', 'maximize', 'unmaximize'\]\) win\.on\(name, saver\.soon\)/)
    expect(index).toMatch(/win\.on\('close', event => \{\n\s+saver\.now\(\)\n/)
    expect(index).toMatch(/win\.on\('closed', \(\) => \{\n\s+saver\.stop\(\)\n/)
  })
})

describe('createBoundsSaver', () => {
  afterEach(() => vi.useRealTimers())

  // 최대화한 창: getBounds()는 화면 전체이고, 돌아갈 크기는 getNormalBounds()에 있다
  const fakeWindow = (state = {}) => ({
    isDestroyed: () => Boolean(state.destroyed),
    isMinimized: () => Boolean(state.minimized),
    isMaximized: () => Boolean(state.maximized),
    getNormalBounds: () => ({ x: 10, y: 20, width: 900, height: 600 }),
    getBounds: () => ({ x: 0, y: 0, width: 1920, height: 1040 })
  })
  const fakeStore = () => ({ set: vi.fn() })

  it('saves the normal bounds and whether the window is maximized, at once', () => {
    const windows = fakeStore()
    createBoundsSaver(fakeWindow({ maximized: true }), windows).now()
    expect(windows.set).toHaveBeenCalledExactlyOnceWith({ x: 10, y: 20, width: 900, height: 600 }, true)
  })

  it('saves once, half a second after the last of many moves', () => {
    vi.useFakeTimers()
    const windows = fakeStore()
    const saver = createBoundsSaver(fakeWindow(), windows)

    expect(BOUNDS_SAVE_DELAY_MS).toBe(500)
    for (let i = 0; i < 20; i++) {
      saver.soon()
      vi.advanceTimersByTime(BOUNDS_SAVE_DELAY_MS - 1)
    }
    expect(windows.set).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(windows.set).toHaveBeenCalledExactlyOnceWith({ x: 10, y: 20, width: 900, height: 600 }, false)
  })

  it('does not save a second time after the save of the close', () => {
    vi.useFakeTimers()
    const windows = fakeStore()
    const saver = createBoundsSaver(fakeWindow(), windows)

    saver.soon()
    saver.now()
    vi.advanceTimersByTime(BOUNDS_SAVE_DELAY_MS * 2)
    expect(windows.set).toHaveBeenCalledOnce()
  })

  it('drops a waiting save when the window is gone', () => {
    vi.useFakeTimers()
    const windows = fakeStore()
    const saver = createBoundsSaver(fakeWindow(), windows)

    saver.soon()
    saver.stop()
    vi.advanceTimersByTime(BOUNDS_SAVE_DELAY_MS * 2)
    expect(windows.set).not.toHaveBeenCalled()
  })

  // 최소화한 동안에는 최대화했었는지 알 수 없다: 그 전에 저장한 것을 둔다
  it('leaves what is stored while the window is minimized or destroyed', () => {
    const windows = fakeStore()
    createBoundsSaver(fakeWindow({ minimized: true }), windows).now()
    createBoundsSaver(fakeWindow({ destroyed: true }), windows).now()
    expect(windows.set).not.toHaveBeenCalled()
  })

  // 창은 닫혀야 한다
  it('never throws when the bounds cannot be saved', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('disk full')
    expect(() => createBoundsSaver(fakeWindow(), { set() { throw failure } }).now()).not.toThrow()
    expect(error).toHaveBeenCalledWith('The window bounds could not be saved', failure)
    error.mockRestore()
  })
})
