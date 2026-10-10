import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW, MAX_ZOOM, MIN_ZOOM, fitView, isRealSize, sanitizeView, scaleView, settleSize, viewOf, zoomAround } from './view'

describe('sanitizeView', () => {
  it('keeps a valid view and drops extra keys', () => {
    expect(sanitizeView({ k: 1.5, x: -120, y: 30.5 })).toEqual({ k: 1.5, x: -120, y: 30.5 })
    expect(sanitizeView({ k: 1, x: 0, y: 0, evil: true })).toEqual({ k: 1, x: 0, y: 0 })
  })

  it('rejects anything that cannot be restored', () => {
    for (const view of [null, undefined, 'x', 5, {}, { k: 1 }, { k: 1, x: 0 }, { k: '1', x: 0, y: 0 },
      { k: NaN, x: 0, y: 0 }, { k: 1, x: Infinity, y: 0 }, { k: 0, x: 0, y: 0 }, { k: 0.05, x: 0, y: 0 }, { k: 3, x: 0, y: 0 }]) {
      expect(sanitizeView(view)).toBe(null)
    }
  })

  it('accepts the zoom limits and the default', () => {
    expect(sanitizeView({ k: 0.1, x: 0, y: 0 })).not.toBe(null)
    expect(sanitizeView({ k: 2, x: 0, y: 0 })).not.toBe(null)
    expect(sanitizeView(DEFAULT_VIEW)).toEqual(DEFAULT_VIEW)
  })
})

describe('sanitizeView: the size of the canvas area the view was seen in', () => {
  it('keeps w and h when both are usable', () => {
    expect(sanitizeView({ k: 1, x: 5, y: 6, w: 1010, h: 505.5 })).toEqual({ k: 1, x: 5, y: 6, w: 1010, h: 505.5 })
  })

  it('drops both when one is missing or unusable, and keeps the view', () => {
    for (const size of [{ w: 800 }, { h: 600 }, { w: 0, h: 600 }, { w: -1, h: 600 }, { w: '800', h: 600 }, { w: NaN, h: 600 }, { w: Infinity, h: 600 }, { w: 1e9, h: 600 }]) {
      expect(sanitizeView({ k: 1, x: 0, y: 0, ...size })).toEqual({ k: 1, x: 0, y: 0 })
    }
  })
})

describe('scaleView', () => {
  const view = { k: 1, x: 100, y: 50 }
  const from = { width: 1000, height: 600 }
  // 화면의 점(px)이 가리키는 캔버스 좌표
  const canvasAt = (v, px, py) => [(px - v.x) / v.k, (py - v.y) / v.k]

  it('does nothing when the size is the same', () => {
    expect(scaleView(view, from, { ...from })).toEqual(view)
  })

  it('scales the diagram with the area and keeps its center in the center', () => {
    const half = scaleView(view, from, { width: 500, height: 300 })
    expect(half.k).toBe(0.5)
    expect(canvasAt(half, 250, 150)).toEqual(canvasAt(view, 500, 300))
    // 왼쪽 위 구석에 보이던 점도 구석에 남는다 (같은 비율로 줄었으므로)
    expect(canvasAt(half, 0, 0)).toEqual(canvasAt(view, 0, 0))
  })

  it('follows the side that shrank more, so nothing that was visible leaves the area', () => {
    const narrow = scaleView(view, from, { width: 500, height: 600 })
    expect(narrow.k).toBe(0.5)
    expect(canvasAt(narrow, 250, 300)).toEqual(canvasAt(view, 500, 300))

    const low = scaleView(view, from, { width: 1000, height: 300 })
    expect(low.k).toBe(0.5)
    expect(canvasAt(low, 500, 150)).toEqual(canvasAt(view, 500, 300))
  })

  it('does not zoom in when only one side grows, and stays centered', () => {
    const wide = scaleView(view, from, { width: 2000, height: 600 })
    expect(wide.k).toBe(1)
    expect(canvasAt(wide, 1000, 300)).toEqual(canvasAt(view, 500, 300))
  })

  it('grows when both sides grow', () => {
    expect(scaleView(view, from, { width: 1500, height: 900 }).k).toBe(1.5)
  })

  it('comes back to the same view from the remembered one, whatever happened in between', () => {
    const small = scaleView(view, from, { width: 300, height: 200 })
    expect(small.k).toBeLessThan(view.k)
    expect(scaleView(view, from, from)).toEqual(view)
  })

  it('stays inside the zoom limits and keeps the center', () => {
    const tiny = scaleView({ k: 0.2, x: 0, y: 0 }, from, { width: 100, height: 60 })
    expect(tiny.k).toBe(MIN_ZOOM)
    expect(canvasAt(tiny, 50, 30)).toEqual(canvasAt({ k: 0.2, x: 0, y: 0 }, 500, 300))
    expect(scaleView({ k: 1.5, x: 0, y: 0 }, from, { width: 4000, height: 2400 }).k).toBe(MAX_ZOOM)
  })

  it('returns the view unchanged when a size is unknown, without extra keys', () => {
    for (const size of [null, undefined, {}, { width: 0, height: 600 }, { width: 1000, height: NaN }]) {
      expect(scaleView({ ...view, w: 1, h: 2 }, size, from)).toEqual(view)
      expect(scaleView(view, from, size)).toEqual(view)
    }
  })
})

describe('isRealSize', () => {
  it('needs a width and a height above zero', () => {
    expect(isRealSize({ width: 1000, height: 600 })).toBe(true)
    expect(isRealSize({ width: 0.5, height: 0.5 })).toBe(true)
    for (const size of [null, undefined, {}, { width: 1000 }, { width: 1000, height: 0 }, { width: 0, height: 600 }, { width: -5, height: 600 }, { width: NaN, height: 600 }, { width: 1000, height: Infinity }, { width: '1000', height: 600 }]) {
      expect(isRealSize(size)).toBe(false)
    }
  })
})

// 터미널 패널을 최대화한 동안 캔버스 영역은 높이가 0이다. 그때 연 다이어그램의 보기는 크기를 모른 채 기억된다.
describe('settleSize', () => {
  const collapsed = { width: 1000, height: 0 }
  const now = { width: 1000, height: 476 }

  it('takes the first known size for a view that was opened in a collapsed area', () => {
    expect(settleSize(collapsed, now)).toEqual(now)
    expect(settleSize(collapsed, now)).not.toBe(now)
    expect(settleSize(undefined, now)).toEqual(now)
  })

  it('keeps a size that is already known', () => {
    const seen = { width: 1000, height: 756 }
    expect(settleSize(seen, now)).toBe(seen)
  })

  it('waits while the area is still collapsed', () => {
    expect(settleSize(collapsed, { width: 1000, height: 0 })).toBe(collapsed)
    expect(settleSize(collapsed, null)).toBe(collapsed)
  })

  // 크기를 알게 된 뒤에는 영역이 바뀔 때 보기가 따라간다 (모르는 채로는 scaleView가 그대로 돌려준다).
  it('lets the view follow the area again', () => {
    const view = { k: 1, x: 0, y: 0 }
    const smaller = { width: 1000, height: 238 }
    expect(scaleView(view, collapsed, smaller)).toEqual(view)
    expect(scaleView(view, settleSize(collapsed, now), smaller).k).toBe(0.5)
  })
})

describe('viewOf', () => {
  it('rounds a transform and ignores other fields', () => {
    expect(viewOf({ k: 0.365897, x: 125.32149, y: -148.079, extra: 1 })).toEqual({ k: 0.366, x: 125.3, y: -148.1 })
  })

  it('produces something sanitizeView accepts', () => {
    expect(sanitizeView(viewOf({ k: 0.85, x: 0, y: 0 }))).toEqual({ k: 0.85, x: 0, y: 0 })
  })
})

describe('fitView', () => {
  const viewport = { left: 0, top: 0, width: 1000, height: 600 }

  it('centers a box that fits and keeps the zoom', () => {
    const view = fitView(viewport, { left: -100, top: -50, right: 100, bottom: 50 }, 0.85)
    expect(view).toEqual({ k: 0.85, x: 500, y: 300 })
  })

  it('zooms out when the box is larger than the viewport, never below the limit', () => {
    const view = fitView(viewport, { left: 0, top: 0, right: 3000, bottom: 300 }, 1)
    expect(view.k).toBeCloseTo(0.3)
    expect(view.x + 1500 * view.k).toBeCloseTo(500)
    expect(fitView(viewport, { left: 0, top: 0, right: 1e6, bottom: 1 }, 1).k).toBe(MIN_ZOOM)
  })

  it('centers in the part of the window that is not covered (sidebar)', () => {
    const view = fitView({ left: 320, top: 0, width: 680, height: 600 }, { left: -10, top: -10, right: 10, bottom: 10 }, 1)
    expect(view).toEqual({ k: 1, x: 660, y: 300 })
  })
})

describe('zoomAround', () => {
  // 화면의 점 p가 가리키는 캔버스 좌표
  const canvasAt = (view, p) => ({ x: (p.x - view.x) / view.k, y: (p.y - view.y) / view.k })

  it('changes the zoom and keeps the point under the pointer in place', () => {
    const view = { k: 1.6, x: -300, y: -120 }
    const point = { x: 420, y: 260 }
    const next = zoomAround(view, 0.85, point)
    expect(next.k).toBe(0.85)
    const before = canvasAt(view, point)
    const after = canvasAt(next, point)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('leaves the view alone when the zoom is already there', () => {
    expect(zoomAround({ k: 0.85, x: 10, y: 20 }, 0.85, { x: 300, y: 300 })).toEqual({ k: 0.85, x: 10, y: 20 })
  })

  it('stays inside the zoom limits', () => {
    expect(zoomAround({ k: 1, x: 0, y: 0 }, 50, { x: 0, y: 0 }).k).toBe(MAX_ZOOM)
    expect(zoomAround({ k: 1, x: 0, y: 0 }, 0, { x: 0, y: 0 }).k).toBe(MIN_ZOOM)
  })
})
