import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW, MIN_ZOOM, fitView, sanitizeView, viewOf } from './view'

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
