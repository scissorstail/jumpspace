import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW, MAX_ZOOM, MIN_ZOOM, fitView, fullCanvasIn, isRealSize, sanitizeView, scaleView, shownView, viewOf } from './view'
import { MAX_AREA } from '../../../shared/view.js'

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

  it('takes a side up to MAX_AREA, not one px more', () => {
    expect(sanitizeView({ k: 1, x: 0, y: 0, w: MAX_AREA, h: MAX_AREA })).toEqual({ k: 1, x: 0, y: 0, w: MAX_AREA, h: MAX_AREA })
    expect(sanitizeView({ k: 1, x: 0, y: 0, w: MAX_AREA + 1, h: 600 })).toEqual({ k: 1, x: 0, y: 0 })
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

  it('follows the height of the area, down and up, and stays centered', () => {
    const low = scaleView(view, from, { width: 1000, height: 300 })
    expect(low.k).toBe(0.5)
    expect(canvasAt(low, 500, 150)).toEqual(canvasAt(view, 500, 300))

    const high = scaleView(view, from, { width: 1000, height: 900 })
    expect(high.k).toBe(1.5)
    expect(canvasAt(high, 500, 450)).toEqual(canvasAt(view, 500, 300))

    expect(scaleView(view, from, { width: 1500, height: 900 }).k).toBe(1.5)
  })

  it('keeps the size when only the width changes, and stays centered', () => {
    for (const width of [500, 2000]) {
      const other = scaleView(view, from, { width, height: 600 })
      expect(other.k).toBe(1)
      expect(canvasAt(other, width / 2, 300)).toEqual(canvasAt(view, 500, 300))
    }
  })

  // 터미널 패널을 연 채 확대를 바꾸고 패널을 닫으면 다이어그램이 작은 채로 남았다 (owner, 2026-10-11):
  // 더 많이 줄어든 쪽을 따르는 규칙은 높이만 커질 때 확대하지 않았다. 닫으면 패널이 줄였던 바로 그 비율로 커져야 한다.
  it('undoes a change of the size exactly, whichever size the view was chosen in', () => {
    const full = { width: 1100, height: 756 }
    const withPanel = { width: 1100, height: 476 }
    const chosen = { k: 0.593, x: 166, y: -23.8 } // 패널을 연 채 정한 보기

    const closed = scaleView(chosen, withPanel, full)
    expect(closed.k).toBeCloseTo(0.593 * 756 / 476, 10)
    // 패널을 열 때 줄어드는 비율의 역수만큼 커진다
    expect(closed.k / chosen.k).toBeCloseTo(view.k / scaleView(view, full, withPanel).k, 10)
    // 가운데에 있던 점은 가운데에 남는다
    const [cx, cy] = canvasAt(chosen, 550, 238)
    expect(canvasAt(closed, 550, 378)[0]).toBeCloseTo(cx, 8)
    expect(canvasAt(closed, 550, 378)[1]).toBeCloseTo(cy, 8)

    // 닫힌 캔버스에서 그 보기를 다시 정했더라도(다시 기억했더라도) 패널을 열면 처음 정한 보기다
    const back = scaleView(closed, full, withPanel)
    expect(back.k).toBeCloseTo(chosen.k, 10)
    expect(back.x).toBeCloseTo(chosen.x, 8)
    expect(back.y).toBeCloseTo(chosen.y, 8)
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

// 기억해 둔 보기를 지금 영역에 보여줄 때. 크기 없이 기억된 보기도 있다: 처음 여는 다이어그램(기본 보기), 예전 파일,
// 터미널 패널을 최대화한 동안(캔버스 영역의 높이가 0이다) 정한 것.
describe('shownView', () => {
  const full = { width: 1100, height: 756 }
  const withPanel = { width: 1100, height: 476 }
  const view = { k: 0.85, x: 0, y: 0 }

  it('scales a view from the size it was chosen in', () => {
    expect(shownView({ view, size: withPanel }, full, full)).toEqual(scaleView(view, withPanel, full))
    expect(shownView({ view, size: full }, withPanel, full)).toEqual(scaleView(view, full, withPanel))
    expect(shownView({ view, size: full }, full, full)).toEqual(view)
  })

  it('takes a view without a size as the view of the canvas without the terminal panel', () => {
    for (const size of [null, undefined, { width: 1100, height: 0 }]) {
      // 패널이 없으면 그대로
      expect(shownView({ view, size }, full, full)).toEqual(view)
      // 패널이 열려 있으면 다른 보기처럼 줄어든다 (그대로 두면 패널을 닫을 때 커져서 처음 보기가 아니게 된다)
      const reduced = shownView({ view, size }, withPanel, full)
      expect(reduced).toEqual(scaleView(view, full, withPanel))
      expect(reduced.k).toBeCloseTo(0.85 * 476 / 756, 10)
    }
  })

  // 처음 보기(Reset view)는 크기 없이 기억한다. 누른 때의 캔버스 크기와 함께 기억하면 그 뒤로 창 높이를 따라 커지고
  // 줄어서, 창 높이를 바꾼 뒤의 화면이 그 창에서 Reset view가 주는 화면과 달라진다 (owner, 2026-10-11:
  // "터미널을 켠 상태로 프로그램 전체 높이를 조절하다 보면 reset view 했을 때 묘하게 어긋납니다").
  it('is the starting view in a window of every height when it has no size', () => {
    const home = { view, size: null }
    const panel = 280

    for (const height of [396, 596, 716, 756, 956]) {
      const canvas = { width: 1100, height }
      const area = { width: 1100, height: Math.max(200, height - panel) }

      // 패널이 없으면 어느 높이의 창에서나 처음 보기 그대로
      expect(shownView(home, canvas, canvas)).toEqual(view)
      // 패널이 열려 있으면 그 창의 캔버스에서 패널이 남긴 만큼으로 줄어든다. 가운데 줄은 가운데에 남는다.
      const shown = shownView(home, area, canvas)
      expect(shown.k).toBeCloseTo(0.85 * area.height / height, 10)
      expect(shown.x).toBeCloseTo(550 * (1 - area.height / height), 10)
      expect(shown.y).toBeCloseTo(0, 10)
    }

    // 크기와 함께 기억한 처음 보기는 다른 높이의 창에서 처음 보기가 아니다: 창 높이의 비율만큼 작고, 옆으로 밀려 있다.
    const lower = { width: 1100, height: 716 }
    const lowerArea = { width: 1100, height: 436 }
    const kept = shownView({ view, size: full }, lowerArea, lower)
    const fresh = shownView(home, lowerArea, lower)
    expect(kept.k / fresh.k).toBeCloseTo(716 / 756, 10)
    expect(kept.x - fresh.x).toBeCloseTo(550 * 436 * (1 / 716 - 1 / 756), 10)
  })

  it('shows it as it is while the area is collapsed', () => {
    expect(shownView({ view, size: null }, { width: 1100, height: 0 }, full)).toEqual(view)
    expect(shownView({ view, size: full }, { width: 1100, height: 0 }, full)).toEqual(view)
  })
})

describe('fullCanvasIn', () => {
  const full = { width: 1100, height: 756 }
  const withPanel = { width: 1100, height: 476 }

  it('is the whole area while no panel takes room', () => {
    expect(fullCanvasIn(full, full)).toEqual({ left: 0, top: 0, width: 1100, height: 756 })
  })

  it('is the middle of a lower area, as wide as the full canvas gets at that height', () => {
    expect(fullCanvasIn({ width: 1100, height: 378 }, full)).toEqual({ left: 275, top: 0, width: 550, height: 378 })
  })

  // Arrange nodes가 여기에 맞춘다: 낮고 넓은 영역의 너비에 맞춘 넓은 다이어그램은 패널을 닫으면 양옆이 잘린다.
  it('holds what still fits after the panel is closed', () => {
    const box = { left: 0, top: 0, right: 1300, bottom: 250 }
    const edges = v => [box.left * v.k + v.x, box.right * v.k + v.x]

    const [left, right] = edges(scaleView(fitView(fullCanvasIn(withPanel, full), box, 1), withPanel, full))
    expect(left).toBeGreaterThanOrEqual(0)
    expect(right).toBeLessThanOrEqual(full.width)
    // 닫은 뒤에는 캔버스 너비의 90%를 차지한다 (닫힌 캔버스에서 맞춘 것과 같다)
    expect(right - left).toBeCloseTo(full.width * 0.9, 6)

    const [, cut] = edges(scaleView(fitView({ left: 0, top: 0, ...withPanel }, box, 1), withPanel, full))
    expect(cut).toBeGreaterThan(full.width)
  })

  it('is the whole area when a size is unknown or the area is not lower', () => {
    const whole = { left: 0, top: 0, width: 1100, height: 476 }
    for (const unknown of [null, undefined, {}, { width: 1100, height: 0 }]) {
      expect(fullCanvasIn(withPanel, unknown)).toEqual(whole)
    }
    expect(fullCanvasIn(withPanel, { width: 1100, height: 400 })).toEqual(whole)
    expect(fullCanvasIn({ width: 1100, height: 0 }, full)).toEqual({ left: 0, top: 0, width: 1100, height: 0 })
    expect(fullCanvasIn(null, full)).toEqual({ left: 0, top: 0, width: 0, height: 0 })
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

  it('centers in a part of the canvas (the left and top of the viewport)', () => {
    const view = fitView({ left: 320, top: 0, width: 680, height: 600 }, { left: -10, top: -10, right: 10, bottom: 10 }, 1)
    expect(view).toEqual({ k: 1, x: 660, y: 300 })
  })
})

// 편집기가 위의 함수들에 무엇을 넘기는지. (Node 환경이라 화면이 없어서 소스를 읽는다)
describe('the view in the editor component', () => {
  const read = (...parts) => readFileSync(join(__dirname, '..', ...parts), 'utf8').replace(/\r\n/g, '\n')
  const editor = read('components', 'editor', 'index.vue')
  const layout = read('views', 'Layout.vue')

  it('shows the remembered view for the area of now', () => {
    expect(editor).toMatch(/this\.setView\(shownView\(this\.base, this\.areaSize\(\), this\.fullSize\(\)\)\)/)
  })

  // 패널이 없을 때의 캔버스는 영역(#editor-area)과 터미널 패널을 함께 담는 #workspace의 크기다.
  it('takes the canvas without the terminal panel from the element the area shares with the panel', () => {
    expect(editor).toMatch(/\n\s+fullSize\(\) \{\n\s+const room = this\.\$el\.parentElement\.parentElement\n\n\s+return \{ width: room\.clientWidth, height: room\.clientHeight \}\n\s+\},/)
    expect(editor).toMatch(/\n\s+areaSize\(\) \{\n\s+const area = this\.\$el\.parentElement\n/)
    expect(layout).toMatch(/\n {6}<div\n {8}id="workspace"\n[\s\S]*?\n {6}>\n {8}<div\n {10}id="editor-area"\n[\s\S]*?\n {10}<Editor\n[\s\S]*?\n {8}<\/div>\n[\s\S]*?\n {8}<TerminalPanel ref="terminalPanel" \/>\n {6}<\/div>/)
  })

  it('remembers a view the user chose with the size of the area it was chosen in', () => {
    expect(editor).toMatch(/const \{ k, x, y \} = this\.editor\.view\.area\.transform\n\s+this\.keepView\(\{ k, x, y \}, this\.areaSize\(\)\)/)
  })

  // 크기가 없는 보기(처음 보기)는 크기 없이 저장된다. 다시 열면 한 번도 옮기지 않은 다이어그램과 같다.
  it('saves no size with a view that has none', () => {
    expect(editor).toMatch(/this\.\$emit\('view-change', \{ \.\.\.viewOf\(view\), \.\.\.\(isRealSize\(size\) && \{ w: size\.width, h: size\.height \}\) \}\)/)
  })

  // 크기가 없는 보기는 패널이 없을 때의 캔버스(#workspace)에서의 보기라서, 그 크기가 바뀌면 영역이 그대로여도
  // 다시 보여줘야 한다: 패널이 캔버스를 가장 낮은 높이까지 밀어 올린 창에서는 창 높이를 바꿔도 영역은 그대로다.
  // (화면 검사로는 가릴 수 없다: 지금의 패널은 높이를 한 박자 늦게 맞춰서 그동안 영역도 잠깐 바뀐다)
  it('shows the view again when the area or the canvas without the panel changes size', () => {
    expect(editor).toMatch(/this\.areaObserver = new ResizeObserver\(\(\) => \{\n\s+this\.editor\.view\.resize\(\)\n\s+this\.rescaleView\(\)\n\s+\}\)\n\s+this\.areaObserver\.observe\(this\.\$el\.parentElement\)\n\s+this\.areaObserver\.observe\(this\.\$el\.parentElement\.parentElement\)\n/)
  })

  // 여는 순간의 영역 크기를 그 보기의 크기로 삼으면: 머리글이 다시 그려지기 전이라 영역이 몇 px 낮아서 처음 보기가
  // 조금 커지고, 터미널 패널이 열려 있으면 줄어들지 않은 채로 보이다가 패널을 닫을 때 커진다.
  it('opens a view that was saved without a size without one', () => {
    expect(editor).toMatch(/this\.base = \{ view: \{ k, x, y \}, size: w > 0 && h > 0 \? \{ width: w, height: h \} : null \}/)
  })

  it('arranges the nodes into the part of the area that still fits when the panel is closed', () => {
    expect(editor).toMatch(/const viewport = fullCanvasIn\(\{ width: container\.clientWidth, height: container\.clientHeight \}, this\.fullSize\(\)\)/)
    expect(editor).toMatch(/this\.setView\(fitView\(viewport, box, k\)\)/)
  })
})
