import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isCanvasDoubleClick, lockedPress } from './locked-press'

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

// 캔버스의 더블클릭은 머리글의 Reset view와 같은 일을 한다 (owner, 2026-10). 어디까지가 캔버스인지가 여기서 정해진다.
describe('isCanvasDoubleClick', () => {
  const twice = target => ({ target })
  const background = el('div', ['background'], canvas)
  const connection = el('div', ['connection'], canvas)
  const line = el('path', ['main-path'], el('svg', [], connection))
  const contextMenu = el('div', ['context-menu'], canvas)

  it.each([[false], [true]])('takes a double click on the empty canvas, locked: %s', isLocked => {
    expect(isCanvasDoubleClick(twice(canvas), { isLocked })).toBe(true)
    expect(isCanvasDoubleClick(twice(background), { isLocked })).toBe(true)
  })

  it('takes it without being told about the lock', () => {
    expect(isCanvasDoubleClick(twice(canvas))).toBe(true)
  })

  // 편집 중에는 노드 위의 더블클릭이 노드의 것이다 (이름을 고르는 것 등).
  it.each([
    ['the box of the node', node],
    ['the icon', icon],
    ['the name', name],
    ['the details', details],
    ['a socket', socket]
  ])('leaves a double click on %s alone while the diagram is edited', (_, target) => {
    expect(isCanvasDoubleClick(twice(target), { isLocked: false })).toBe(false)
    expect(isCanvasDoubleClick(twice(target))).toBe(false)
  })

  // 잠긴 동안 노드의 그림과 글자는 배경처럼 군다: 그 위에서 끌면 캔버스가 움직이고, 더블클릭도 캔버스의 것이다.
  it.each([
    ['the box of the node', node],
    ['the icon', icon],
    ['the name', name],
    ['the details', details],
    ['a socket', socket]
  ])('takes a double click on %s of a locked diagram', (_, target) => {
    expect(isCanvasDoubleClick(twice(target), locked)).toBe(true)
  })

  it.each([
    ['a button', button],
    ['the icon inside a button', buttonIcon],
    ['the badge next to a button', badge]
  ])('never takes a double click on %s: pressing a button twice must not move the view', (_, target) => {
    expect(isCanvasDoubleClick(twice(target), locked)).toBe(false)
    expect(isCanvasDoubleClick(twice(target), { isLocked: false })).toBe(false)
  })

  it.each([[false], [true]])('leaves a double click on a line or on the right-click menu alone, locked: %s', isLocked => {
    expect(isCanvasDoubleClick(twice(connection), { isLocked })).toBe(false)
    expect(isCanvasDoubleClick(twice(line), { isLocked })).toBe(false)
    expect(isCanvasDoubleClick(twice(contextMenu), { isLocked })).toBe(false)
    expect(isCanvasDoubleClick(twice(el('div', ['item'], contextMenu)), { isLocked })).toBe(false)
  })

  it('copes with a target that is not an element', () => {
    expect(isCanvasDoubleClick(twice(null), locked)).toBe(false)
    expect(isCanvasDoubleClick(twice({}), locked)).toBe(false)
    expect(isCanvasDoubleClick(undefined)).toBe(false)
  })
})

// 단추와 더블클릭이 같은 일을 하려면 같은 함수를 불러야 한다. 한쪽만 다른 보기로 가게 고치면 여기서 걸린다.
describe('Reset view', () => {
  const read = (...parts) => readFileSync(join(__dirname, '..', ...parts), 'utf8').replace(/\r\n/g, '\n')
  const editor = read('components', 'editor', 'index.vue')
  const layout = read('views', 'Layout.vue')

  it('is one function of the editor, used by the header button and by the double click', () => {
    // 처음 보기는 터미널 패널이 없을 때의 캔버스(fullSize)에서의 보기로 기억하고, 지금 영역에 맞춰 보여준다.
    // 패널이 열린 영역의 크기로 기억하면 패널을 닫을 때 커지면서 다이어그램의 왼쪽이 화면 밖으로 나간다.
    expect(editor).toMatch(/\n\s+resetView\(\) \{\n\s+this\.keepView\(\{ \.\.\.DEFAULT_VIEW \}, this\.fullSize\(\)\)\n\s+this\.rescaleView\(\)\n\s+\},/)
    expect(editor).toMatch(/if \(this\.editorData && isCanvasDoubleClick\(e, \{ isLocked: this\.isLocked \}\)\) this\.resetView\(\)/)
    expect(editor).toMatch(/addEventListener\('dblclick', this\.onDoubleClick\)/)
    expect(layout).toMatch(/\n\s+resetView\(\) \{\n\s+this\.\$refs\.editorRef\.resetView\(\)\n\s+\},/)
  })

  // Rete는 더블클릭하면 확대한다. 그 확대가 남아 있으면 처음 보기로 돌린 뒤에 다시 확대된다.
  it('replaces the zoom Rete does on a double click', () => {
    expect(editor).toMatch(/this\.editor\.on\('zoom', \(\{ source \}\) => source !== 'dblclick'\)/)
  })
})
