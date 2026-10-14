import { describe, expect, it } from 'vitest'
import { mousePoint } from './mouse-point.js'

const LIMIT = 2 ** 31 - 1

describe('mousePoint', () => {
  it('gives back the place the page asks for', () => {
    expect(mousePoint({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 })
    expect(mousePoint({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    // 화면이 보내는 값은 정수가 아닐 수 있다
    expect(mousePoint({ x: 511.5, y: 0.25 })).toEqual({ x: 511.5, y: 0.25 })
  })

  // 창 밖에서 놓은 드래그: 그 자리의 mouseMove가 hover를 푼다
  it('takes a place outside the window too', () => {
    expect(mousePoint({ x: -1, y: -1 })).toEqual({ x: -1, y: -1 })
    expect(mousePoint({ x: -300, y: 200 })).toEqual({ x: -300, y: 200 })
    expect(mousePoint({ x: 100000, y: 100000 })).toEqual({ x: 100000, y: 100000 })
  })

  it('takes only the two numbers, whatever else comes with them', () => {
    expect(mousePoint({ x: 1, y: 2, type: 'mouseDown', button: 'left' })).toEqual({ x: 1, y: 2 })
  })

  // 유한한 수이기는 하다: 이런 값을 넘기고 나면 화면이 마우스의 움직임을 받지 못했다
  it('refuses numbers no screen can hold', () => {
    for (const data of [{ x: 1e308, y: -1e308 }, { x: 1e308, y: 5 }, { x: 5, y: 1e308 }, { x: 5, y: -1e308 }, { x: 3e38, y: 3e38 }, { x: 2 ** 53, y: 2 ** 53 }, { x: Number.MAX_VALUE, y: 0 }]) {
      expect(mousePoint(data), JSON.stringify(data)).toBeNull()
    }
  })

  it('draws the line at what a 32 bit integer holds, on both sides', () => {
    expect(mousePoint({ x: LIMIT, y: -LIMIT })).toEqual({ x: LIMIT, y: -LIMIT })
    expect(mousePoint({ x: -LIMIT, y: LIMIT })).toEqual({ x: -LIMIT, y: LIMIT })
    for (const data of [{ x: LIMIT + 1, y: 0 }, { x: 0, y: LIMIT + 1 }, { x: -LIMIT - 1, y: 0 }, { x: 0, y: -LIMIT - 1 }]) {
      expect(mousePoint(data), JSON.stringify(data)).toBeNull()
    }
  })

  it('refuses what is no number at all', () => {
    for (const data of [{ x: Infinity, y: 5 }, { x: 5, y: -Infinity }, { x: NaN, y: 5 }, { x: 5, y: NaN }]) {
      expect(mousePoint(data)).toBeNull()
    }
  })

  it('refuses what is no pair of numbers', () => {
    for (const data of [undefined, null, 0, 5, 'x', true, [], [5, 5], {}, { x: 5 }, { y: 5 }, { x: '5', y: '5' }, { x: 5, y: '5' }, { x: '5', y: 5 }, { x: [5], y: 5 }, { x: true, y: true }, { x: null, y: null }, { x: 5n, y: 5n }, { x: { valueOf: () => 5 }, y: 5 }]) {
      expect(mousePoint(data)).toBeNull()
    }
  })
})
