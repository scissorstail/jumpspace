import { describe, expect, it } from 'vitest'
import { MENU_GAP, menuPlace } from './menu-place'

// 기본 창(1100 x 800, 터미널 없음)의 캔버스와 메뉴의 크기 (헤드리스 검사에서 잰 값: 캔버스 메뉴 218 x 98, 노드 메뉴 176 x 98)
const room = { left: 0, top: 44, right: 1100, bottom: 800 }
const CANVAS_MENU = [218, 98]
const NODE_MENU = [176, 98]

describe('the place of the right-click menu', () => {
  it('puts its top left corner at the pointer, a gap away, when there is room', () => {
    expect(MENU_GAP).toBe(2)
    expect(menuPlace([300, 520], CANVAS_MENU, room)).toEqual([302, 522])
    expect(menuPlace([156, 197], NODE_MENU, room)).toEqual([158, 199])
  })

  it('opens to the left at the right edge, with its right edge at the pointer', () => {
    expect(menuPlace([1090, 300], CANVAS_MENU, room)).toEqual([1090 - 2 - 218, 302])
  })

  it('opens upward at the bottom, also over a terminal panel that starts lower', () => {
    expect(menuPlace([600, 790], CANVAS_MENU, room)).toEqual([602, 790 - 2 - 98])
    expect(menuPlace([600, 500], CANVAS_MENU, { ...room, bottom: 520 })).toEqual([602, 400])
  })

  it('turns both ways in the bottom right corner', () => {
    expect(menuPlace([1090, 790], NODE_MENU, room)).toEqual([1090 - 2 - 176, 790 - 2 - 98])
  })

  it('keeps the usual side while the menu fits exactly, and turns one pixel later', () => {
    expect(menuPlace([1100 - 2 - 218, 300], CANVAS_MENU, room)).toEqual([1100 - 218, 302])
    expect(menuPlace([1100 - 2 - 218 + 1, 300], CANVAS_MENU, room)).toEqual([1100 - 2 - 218 + 1 - 2 - 218, 302])
    expect(menuPlace([300, 800 - 2 - 98], CANVAS_MENU, room)).toEqual([302, 800 - 98])
    expect(menuPlace([300, 800 - 2 - 98 + 1], CANVAS_MENU, room)).toEqual([302, 800 - 2 - 98 + 1 - 2 - 98])
  })

  it('takes the room where it is: a canvas that does not start at the top left of the window', () => {
    const lower = { left: 40, top: 100, right: 700, bottom: 400 }
    expect(menuPlace([60, 120], CANVAS_MENU, lower)).toEqual([62, 122])
    expect(menuPlace([650, 390], CANVAS_MENU, lower)).toEqual([650 - 2 - 218, 390 - 2 - 98])
  })

  it('pushes it into the room when neither side has room, and to the start when the room is smaller than the menu', () => {
    const low = { left: 0, top: 44, right: 1100, bottom: 200 }
    expect(menuPlace([300, 120], CANVAS_MENU, low)).toEqual([302, 200 - 98])
    expect(menuPlace([300, 120], CANVAS_MENU, { ...low, bottom: 120 })).toEqual([302, 44])
    expect(menuPlace([100, 300], CANVAS_MENU, { ...room, right: 200 })).toEqual([0, 302])
  })

  // 어디서 열어도 메뉴는 캔버스 안에 있고, 포인터는 메뉴 밖에 메뉴의 한 모서리에서 MENU_GAP만큼 떨어져 있다:
  // 그 자리를 한 번 더 누르면 메뉴 밖이다 (오른쪽 클릭 뒤 같은 자리의 클릭이 Delete를 누르지 않는다)
  it('is inside the canvas with the pointer out of it, at one of its corners, wherever it opens', () => {
    for (const [width, height] of [CANVAS_MENU, NODE_MENU]) {
      for (let x = room.left; x <= room.right; x += 10) {
        for (let y = room.top; y <= room.bottom; y += 8) {
          const [left, top] = menuPlace([x, y], [width, height], room)
          const right = left + width
          const bottom = top + height
          expect(left >= room.left && top >= room.top && right <= room.right && bottom <= room.bottom).toBe(true)
          expect(x >= left && x < right && y >= top && y < bottom).toBe(false)
          expect([left - x, x - right]).toContain(MENU_GAP)
          expect([top - y, y - bottom]).toContain(MENU_GAP)
        }
      }
    }
  })
})
