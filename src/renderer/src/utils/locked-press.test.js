import { describe, expect, it } from 'vitest'
import { lockedPress } from './locked-press'

// 테스트는 Node에서 돌아서 DOM이 없다. closest()만 있는 작은 요소를 만든다 (태그와 클래스 선택자만 안다).
function el(tag, classes = [], parent = null) {
  return {
    tag,
    classes,
    parent,
    closest(selectors) {
      const wanted = selectors.split(',').map(x => x.trim())
      for (let node = this; node; node = node.parent) {
        if (wanted.some(s => (s.startsWith('.') ? node.classes.includes(s.slice(1)) : node.tag === s))) return node
      }
      return null
    }
  }
}

// 캔버스 > 노드 > (단추 줄 > 단추 자리 > 단추 > 아이콘) / (정보 > 그림, 이름표, 접속 정보) / 소켓
const canvas = el('div', ['rete'])
const node = el('div', ['node', 'site'], el('div', [], canvas))
const menu = el('div', ['header-menu'], node)
const item = el('span', ['menu-item'], menu)
const button = el('button', ['menu-button'], item)
const buttonIcon = el('svg', ['b-icon'], button)
const badge = el('span', ['badge'], item)
const info = el('div', ['info-block'], node)
const icon = el('img', ['info-diagram'], info)
const name = el('span', [], el('div', ['info-name'], info))
const details = el('div', ['info-text'], info)
const socket = el('div', ['socket', 'output'], node)

const press = (target, extra = {}) => ({ target, button: 0, pointerType: 'mouse', ...extra })
const locked = { isLocked: true }

describe('lockedPress', () => {
  it.each([
    ['the box of the node', node],
    ['the icon', icon],
    ['the name', name],
    ['the details', details],
    ['a socket', socket],
    ['the empty part of the row of buttons', menu]
  ])('hands a press on %s of a locked diagram to the canvas', (_, target) => {
    expect(lockedPress(press(target), locked)).toBe('canvas')
  })

  it.each([
    ['a button', button],
    ['the icon of a button', buttonIcon],
    ['the badge of a button', badge]
  ])('leaves a press on %s alone', (_, target) => {
    expect(lockedPress(press(target), locked)).toBe(null)
  })

  it('leaves form controls and popovers alone, should one sit inside a node', () => {
    const popover = el('div', ['vt-popover'], node)

    expect(lockedPress(press(el('input', [], info)), locked)).toBe(null)
    expect(lockedPress(press(el('div', ['p-3'], popover)), locked)).toBe(null)
  })

  it('does nothing while the diagram can be edited: the node is dragged and selected as before', () => {
    expect(lockedPress(press(icon), { isLocked: false })).toBe(null)
    expect(lockedPress(press(icon))).toBe(null)
  })

  it('does nothing outside a node', () => {
    expect(lockedPress(press(canvas), locked)).toBe(null)
    expect(lockedPress(press(el('path', ['main-path'], canvas)), locked)).toBe(null)
  })

  // 오른쪽 클릭은 메뉴 쪽으로 간다 (잠겨 있다는 안내). 터치와 펜에는 단추가 없다.
  it('only takes the left mouse button, and any touch or pen', () => {
    expect(lockedPress(press(icon, { button: 2 }), locked)).toBe(null)
    expect(lockedPress(press(icon, { button: 1 }), locked)).toBe(null)
    expect(lockedPress(press(icon, { pointerType: 'touch', button: 0 }), locked)).toBe('canvas')
    expect(lockedPress(press(icon, { pointerType: 'pen', button: 0 }), locked)).toBe('canvas')
  })

  it('copes with a target that is not an element', () => {
    expect(lockedPress(press(null), locked)).toBe(null)
    expect(lockedPress(press({}), locked)).toBe(null)
    expect(lockedPress(undefined, locked)).toBe(null)
  })
})
