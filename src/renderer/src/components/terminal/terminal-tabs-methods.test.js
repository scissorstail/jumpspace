import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { duplicateNumbers, numberedTitle, tabRowChange } from '../../utils/terminal-sessions'
import { revealScrollLeft, sessionRouteText, sessionStatusText } from '../../utils/terminal-view'

// 탭 줄이 스스로 하는 일: 나누기 단추의 상태와 말, 칸마다의 탭 목록과 끌어 놓은 탭, 같은 이름의 번호, 휠로 넘기기, 보이는 탭이 보이게 넘기기.
// DOM 없이 도는 테스트라서 .vue를 불러올 수 없다: <script>의 내용을 꺼내 import만 바꿔서 돌리고, computed, methods,
// watch와 mounted를 가짜 this로 부른다 (terminal-panel-methods.test.js와 같은 방법). 템플릿은 terminal-tabs.test.js가 읽는다.
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'terminal-tabs.vue'), 'utf8').replace(/\r\n/g, '\n')
const script = source.match(/<script>\n([\s\S]*?)<\/script>/)[1]
const imported = [...script.matchAll(/^import (?:\{ ([^}]+) \}|(\w+)) from .*$/gm)].flatMap(match => (match[1] ?? match[2]).split(', '))
const given = { draggable: { name: 'draggable' }, duplicateNumbers, numberedTitle, revealScrollLeft, sessionRouteText, sessionStatusText, tabRowChange }
const body = script.replace(/^import .*\n/gm, '').replace('export default', 'return')
const component = runInThisContext(`(function (${imported.join(', ')}) {\n${body}\n})`)(...imported.map(name => given[name]))

// 가짜 this: 패널이 주는 값(props)과, 그것으로 계산하는 값, 메서드
function tabs(props = {}) {
  const vm = { sessions: [], activeKey: null, sideKey: null, rightKeys: [], isMaximized: false, isMinimized: false, $refs: {}, ...props }
  for (const [name, get] of Object.entries(component.computed)) Object.defineProperty(vm, name, { get: () => get.call(vm) })
  return Object.assign(vm, component.methods)
}
const session = (key, title, extra = {}) => ({ key, title, status: 'running', ...extra })

// 가짜 탭 목록: 보이는 폭(width), 탭을 다 늘어놓은 폭(content), 넘긴 만큼(scrollLeft). x는 창에서의 왼쪽 끝이다.
const list = ({ x = 100, width = 300, content = 900, scrollLeft = 0 } = {}) => ({
  clientWidth: width,
  scrollWidth: content,
  scrollLeft,
  getBoundingClientRect() { return { left: x, width } }
})
// 늘어놓은 탭들 안에서 at에 있는 탭. 창에서의 자리는 목록이 넘어간 만큼 왼쪽이다.
// 탭이 든 목록은 그 탭의 parentElement다 (나눈 동안에는 칸마다 목록이 하나다).
const tab = (listEl, at, width = 140) => ({ parentElement: listEl, getBoundingClientRect: () => ({ left: listEl.getBoundingClientRect().left + at - listEl.scrollLeft, width }) })
// 휠이 굴러간 목록은 event.currentTarget이다 (@wheel.native이 목록 요소에 걸려 있다)
const wheel = (deltaY, deltaX = 0, currentTarget = null) => ({ deltaX, deltaY, currentTarget, preventDefault: vi.fn() })

afterEach(() => vi.unstubAllGlobals())

describe('the script of the tab row in this test', () => {
  it('gets a stand-in for everything it imports', () => {
    expect(imported.filter(name => !Object.hasOwn(given, name))).toEqual([])
    expect(component.name).toBe('TerminalTabs')
  })
})

describe('the split button of the tab row', () => {
  it('is off and cannot be pressed with fewer than two tabs, and says why', () => {
    for (const sessions of [[], [session(1, 'web')]]) {
      const vm = tabs({ sessions })
      expect([vm.isSplit, vm.canSplit, vm.splitTitle]).toEqual([false, false, 'Split needs a second terminal'])
    }
  })

  it('can be pressed with two tabs', () => {
    const vm = tabs({ sessions: [session(1, 'web'), session(2, 'db')] })
    expect([vm.isSplit, vm.canSplit, vm.splitTitle]).toEqual([false, true, 'Split: show two terminals side by side'])
  })

  // 나눈 것을 합치는 것은 늘 된다: 나눈 채로 남은 탭이 하나여도 단추는 눌린다.
  it('is on while a second tab is shown, and can always be pressed then', () => {
    for (const sessions of [[session(1, 'web'), session(2, 'db')], [session(1, 'web')]]) {
      const vm = tabs({ sessions, sideKey: 2 })
      expect([vm.isSplit, vm.canSplit, vm.splitTitle]).toEqual([true, true, 'Show one terminal'])
    }
  })

  it('is off when the panel says nothing about a second tab', () => {
    const value = prop => (typeof prop.default === 'function' ? prop.default() : prop.default)
    const defaults = Object.fromEntries(Object.entries(component.props).filter(([, prop]) => 'default' in prop).map(([name, prop]) => [name, value(prop)]))
    expect(defaults).toEqual({ activeKey: null, sideKey: null, rightKeys: [], isMaximized: false, isMinimized: false })
    expect(tabs({ ...defaults, sessions: [session(1, 'web'), session(2, 'db')] }).isSplit).toBe(false)
    expect(component.props.sessions.required).toBe(true)
  })
})

describe('the rows of the tab row', () => {
  const sessions = [session(1, 'web'), session(2, 'db'), session(3, 'log'), session(4, 'app')]
  const keysOf = rows => rows.map(row => [row.side, row.sessions.map(x => x.key)])

  it('are one row in the order of the tabs while the panel is not split', () => {
    expect(keysOf(tabs({ sessions, activeKey: 1 }).rows)).toEqual([['left', [1, 2, 3, 4]]])
  })

  it('are a row for each half while it is split, each in the order of the tabs', () => {
    const vm = tabs({ sessions, activeKey: 1, sideKey: 2, rightKeys: [4, 2] })
    expect(keysOf(vm.rows)).toEqual([['left', [1, 3]], ['right', [2, 4]]])
  })

  // 최소화한 동안에는 아래에 칸이 없다: 한 줄이다. 다시 펼치면 칸마다의 줄로 돌아온다 (store는 그대로다).
  it('are one row again while the panel is minimized', () => {
    expect(keysOf(tabs({ sessions, activeKey: 1, sideKey: 2, rightKeys: [2], isMinimized: true }).rows)).toEqual([['left', [1, 2, 3, 4]]])
  })

  it('are lists of tabs, named after their half while split', () => {
    const one = tabs({ sessions, activeKey: 1 })
    expect(one.listData(one.rows[0])).toEqual({ attrs: { role: 'tablist', 'aria-label': 'Terminal tabs' } })
    const split = tabs({ sessions, activeKey: 1, sideKey: 2, rightKeys: [2] })
    expect(split.rows.map(row => split.listData(row))).toEqual([
      { attrs: { role: 'tablist', 'aria-label': 'Tabs of the left half' } },
      { attrs: { role: 'tablist', 'aria-label': 'Tabs of the right half' } }
    ])
  })

  // vuedraggable은 id와 data-*만 요소에 둔다: 다른 속성(role, aria-label)은 끌기의 설정이 되어 요소에 없었다.
  it('get their attributes through the component data of vuedraggable, where they reach the element', () => {
    const list = source.match(/<draggable\n([\s\S]*?)\n\s+>/)[1]
    expect(list).toMatch(/\n\s+:component-data="listData\(row\)"/)
    expect(list).not.toMatch(/\n\s+:?(role|aria-[a-z]+)=/)
  })
})

describe('a tab dropped in a row', () => {
  const sessions = [session(1, 'web'), session(2, 'db'), session(3, 'log')]
  const dropped = (vm, row, keys) => {
    const emitted = []
    vm.$emit = (...args) => emitted.push(args)
    vm.dropped(row, keys.map(key => sessions.find(x => x.key === key)))
    return emitted
  }

  it('gives the new order of that row', () => {
    const vm = tabs({ sessions, activeKey: 1 })
    expect(dropped(vm, vm.rows[0], [3, 1, 2])).toEqual([['reorder', [3, 1, 2]]])
  })

  it('moves a tab of the other row into that half, with the new order of the row', () => {
    const vm = tabs({ sessions, activeKey: 1, sideKey: 2, rightKeys: [2] })
    const [left, right] = vm.rows
    expect(dropped(vm, right, [3, 2])).toEqual([['move', { key: 3, side: 'right', keys: [3, 2] }]])
    expect(dropped(vm, left, [2, 1, 3])).toEqual([['move', { key: 2, side: 'left', keys: [2, 1, 3] }]])
  })

  // 다른 줄로 끌어 간 탭은 그 줄이 알린다: 두 번 알리면 store가 두 번 옮긴다.
  it('says nothing for the row the tab left', () => {
    const vm = tabs({ sessions, activeKey: 1, sideKey: 2, rightKeys: [2] })
    expect(dropped(vm, vm.rows[0], [1])).toEqual([])
  })
})

describe('the names of the tabs', () => {
  // 끌어서 순서를 바꾼 뒤에도 번호는 연 순서(key)를 따른다
  const sessions = [session(3, 'web'), session(1, 'web'), session(2, 'db')]

  it('get a number where two tabs of the row have the same name', () => {
    const vm = tabs({ sessions })
    expect([...vm.numbers]).toEqual([[1, 1], [3, 2]])
  })

  it('carry that number in the tooltip and on the close button, and none when the name is the only one', () => {
    const vm = tabs({ sessions })
    expect(sessions.map(x => vm.label(x))).toEqual(['web (2)', 'web (1)', 'db'])
    // 탭 하나가 닫혀 이름이 하나만 남으면 번호도 사라진다
    expect(tabs({ sessions: sessions.slice(1) }).label(sessions[1])).toBe('web')
  })

  it('are followed by the state and the path of the session, in the words every tab list uses', () => {
    expect(component.methods.statusText).toBe(sessionStatusText)
    expect(component.methods.routeText).toBe(sessionRouteText)
  })
})

// 탭을 누르면 고르고, Ctrl을 누른 채 누르면 같은 접속을 하나 더 연다 (#257)
describe('a click on a tab', () => {
  it('selects it, also with Shift or Alt held', () => {
    const $emit = vi.fn()
    const vm = tabs({ sessions: [session(1, 'web'), session(2, 'db')], activeKey: 1, $emit })

    vm.clicked(vm.sessions[1], { ctrlKey: false })
    vm.clicked(vm.sessions[0], { ctrlKey: false, shiftKey: true })
    vm.clicked(vm.sessions[1], { ctrlKey: false, altKey: true })
    expect($emit.mock.calls).toEqual([['activate', 2], ['activate', 1], ['activate', 2]])
  })

  it('with Ctrl asks the panel for another tab of the same connection, and selects nothing itself', () => {
    const $emit = vi.fn()
    const vm = tabs({ sessions: [session(1, 'web'), session(2, 'db')], activeKey: 1, $emit })

    vm.clicked(vm.sessions[0], { ctrlKey: true })
    vm.clicked(vm.sessions[1], { ctrlKey: true, shiftKey: true })
    expect($emit.mock.calls).toEqual([['duplicate', vm.sessions[0]], ['duplicate', vm.sessions[1]]])
  })
})

describe('the wheel over the tab row', () => {
  it('moves a row that has more tabs than fit, and keeps the wheel from anything else', () => {
    const el = list({ scrollLeft: 50 })
    const vm = tabs()

    const down = wheel(120, 0, el)
    vm.scrollTabs(down)
    expect(el.scrollLeft).toBe(170)
    expect(down.preventDefault).toHaveBeenCalledTimes(1)

    const up = wheel(-120, 0, el)
    vm.scrollTabs(up)
    expect(el.scrollLeft).toBe(50)
    expect(up.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('is left alone when every tab fits', () => {
    for (const content of [300, 280]) {
      const el = list({ content })
      const event = wheel(120, 0, el)
      tabs().scrollTabs(event)
      expect(el.scrollLeft).toBe(0)
      expect(event.preventDefault).not.toHaveBeenCalled()
    }
  })

  // 옆으로 굴리는 휠(터치패드)은 브라우저가 스스로 넘긴다
  it('is left alone when it turns sideways, or not at all', () => {
    const el = list({ scrollLeft: 50 })
    for (const event of [wheel(0, 40, el), wheel(120, 40, el), wheel(0, 0, el)]) {
      tabs().scrollTabs(event)
      expect(el.scrollLeft).toBe(50)
      expect(event.preventDefault).not.toHaveBeenCalled()
    }
  })

  // 나눈 동안에는 목록이 둘이다: 휠은 그것이 굴러간 목록만 넘긴다
  it('moves the row it turns over, not the other one', () => {
    const left = list({ x: 0, scrollLeft: 50 })
    const right = list({ x: 550, scrollLeft: 50 })
    tabs().scrollTabs(wheel(120, 0, right))
    expect([left.scrollLeft, right.scrollLeft]).toEqual([50, 170])
  })

  it('does nothing without a row', () => {
    const event = wheel(120)
    expect(() => tabs().scrollTabs(event)).not.toThrow()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})

describe('the selected tab of a row with more tabs than fit', () => {
  const row = (el, at, extra = {}) => tabs({ activeKey: 5, $refs: { 'tab-5': [tab(el, at)], ...extra } })

  it('is brought to the right edge when it lies to the right of what is in sight', () => {
    const el = list()
    row(el, 500).reveal()
    expect(el.scrollLeft).toBe(500 + 140 - 300)
  })

  it('is brought to the left edge when it lies to the left', () => {
    const el = list({ scrollLeft: 400 })
    row(el, 132).reveal()
    expect(el.scrollLeft).toBe(132)
  })

  it('leaves the row where it is when it is in sight already', () => {
    const el = list({ scrollLeft: 100 })
    row(el, 150).reveal()
    expect(el.scrollLeft).toBe(100)
  })

  // 탭의 자리는 창이 아니라 목록 안에서 잰다: 목록이 창의 어디에 있든 같다
  it('is found by its place in the row, wherever the row is in the window', () => {
    for (const x of [0, 100, 700]) {
      const right = list({ x })
      row(right, 500).reveal()
      expect(right.scrollLeft).toBe(340)

      const left = list({ x, scrollLeft: 400 })
      row(left, 132).reveal()
      expect(left.scrollLeft).toBe(132)
    }
  })

  it('is the tab of the selected key, not another one of the row', () => {
    const el = list()
    const vm = row(el, 500, { 'tab-6': [tab(el, 700)] })
    vm.reveal()
    expect(el.scrollLeft).toBe(340)

    vm.activeKey = 6
    vm.reveal()
    expect(el.scrollLeft).toBe(700 + 140 - 300)
  })

  it('needs a row and a tab that are there', () => {
    const el = list({ scrollLeft: 60 })
    // 탭 줄이 아직 없다, 고른 탭이 없다, 그 탭이 그려지지 않았다 (v-for의 ref는 배열이다), 그 탭이 목록에 없다
    const cases = [
      tabs({ activeKey: 5, $refs: {} }),
      tabs({ activeKey: null, $refs: { 'tab-5': [tab(el, 500)] } }),
      tabs({ activeKey: 5, $refs: { 'tab-5': [] } }),
      tabs({ activeKey: 5, $refs: { 'tab-5': [{ ...tab(el, 500), parentElement: null }] } })
    ]
    for (const vm of cases) expect(() => vm.reveal()).not.toThrow()
    expect(el.scrollLeft).toBe(60)
  })

  // 나눈 동안에는 칸마다 그 칸의 목록에서 보이는 탭이 보이게 넘긴다
  it('is brought into sight in its own row while split, and so is the tab of the other half in the other row', () => {
    const left = list({ x: 0 })
    const right = list({ x: 550, scrollLeft: 400 })
    const vm = tabs({ activeKey: 5, sideKey: 6, $refs: { 'tab-5': [tab(left, 500)], 'tab-6': [tab(right, 132)] } })
    vm.reveal()
    expect([left.scrollLeft, right.scrollLeft]).toEqual([340, 132])
  })

  // 새로 고른 탭은 다음 틱에야 그려진다 (방금 연 탭이면 아직 없다). 다른 칸의 탭이 바뀌어도 (탭을 다른 칸으로 옮겼다) 같다.
  it('is brought into sight after the row was drawn again for a newly selected tab, or a new tab of the other half', () => {
    for (const name of ['activeKey', 'sideKey']) {
      const waiting = []
      const vm = tabs({ activeKey: 5, $nextTick: fn => waiting.push(fn) })
      vm.reveal = vi.fn()

      component.watch[name].call(vm)
      expect(vm.reveal).not.toHaveBeenCalled()
      expect(waiting).toHaveLength(1)
      waiting[0]()
      expect(vm.reveal).toHaveBeenCalledTimes(1)
    }
  })

  // 창이 좁아지거나, 숨겨 둔 패널이 다시 보일 때
  it('is brought into sight again when the row changes its size, until the row is destroyed', () => {
    const observers = []
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) {
        Object.assign(this, { callback, observed: [], disconnected: false })
        observers.push(this)
      }

      observe(el) { this.observed.push(el) }

      disconnect() { this.disconnected = true }
    })
    const vm = tabs({ $el: { id: 'row' } })
    vm.reveal = vi.fn()

    component.mounted.call(vm)
    expect(observers).toHaveLength(1)
    expect(observers[0].observed).toEqual([vm.$el])
    expect(vm.reveal).not.toHaveBeenCalled()
    observers[0].callback()
    observers[0].callback()
    expect(vm.reveal).toHaveBeenCalledTimes(2)

    component.beforeDestroy.call(vm)
    expect(observers[0].disconnected).toBe(true)
  })

  it('can be destroyed before it was mounted', () => {
    expect(() => component.beforeDestroy.call(tabs())).not.toThrow()
  })
})
