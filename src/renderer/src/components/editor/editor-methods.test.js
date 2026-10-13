import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import cloneDeep from 'lodash/cloneDeep'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_VIEW, MAX_ZOOM, MIN_ZOOM, fitView, fullCanvasIn, isRealSize, shownView, viewOf } from '../../utils/view'
import { ARRANGE_GAP, arrangeLayout, boxOf } from '../../utils/arrange'
import { activeTerminalNode, hopKey, routeStates } from '../../utils/terminal-sessions'
import { isCanvasDoubleClick, lockedPress } from '../../utils/locked-press'
import { closesLoop, loopIn, loopText } from '../../utils/link-loop'
import { toastError } from '../../utils/notify'

// 캔버스(components/editor/index.vue)가 하는 일. DOM 없이 도는 테스트라서 .vue도 Rete도 불러올 수 없다: <script>의 내용을 꺼내
// import만 바꿔서 돌리고, mounted와 methods, computed, watch를 가짜 this로 부른다 (Layout-methods.test.js와 같은 방법).
// Rete는 가짜다: 플러그인과 이벤트 등록을 적어 두고, 테스트가 그 이벤트를 일으킨다. 보기와 정렬의 계산(utils)은 진짜다.
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'index.vue'), 'utf8').replace(/\r\n/g, '\n')
const script = source.match(/<script>\n([\s\S]*?)<\/script>/)[1]
const imported = [...script.matchAll(/^import (?:\{ ([^}]+) \}|(\w+)) from .*$/gm)].flatMap(match => (match[1] ?? match[2]).split(', '))

// 일어난 일을 차례로 적는다 (가짜 Rete, 가짜 화면, $emit이 함께 쓴다)
let log = []
const logged = kind => log.filter(entry => Array.isArray(entry) && entry[0] === kind).map(entry => entry.slice(1))
const emitted = name => logged('emit').filter(entry => entry[0] === name).map(entry => entry.slice(1))

class FakeEditor {
  constructor(id, container) {
    this.id = id
    this.container = container
    this.plugins = new Map()
    this.handlers = new Map()
    this.registered = []
    this.nodes = []
    this.silent = false
    // 잠금 플러그인: 있는지(exist), 잠겨 있는지(trigger의 답)
    this.hasReadonly = true
    this.isReadonly = false
    this.components = new Map()
    this.selected = { list: [], clear: () => { log.push(['selected.clear']); this.selected.list = [] } }
    // 연결 플러그인이 손에 든 선을 그리는 요소: 비어 있지 않으면(childElementCount) 소켓 하나가 손에 들려 있다
    this.pickerLine = { childElementCount: 0 }
    const transform = { k: 1, x: 0, y: 0 }
    this.view = {
      // 진짜처럼 보기를 바꾸면 zoomed, translated가 일어난다
      area: {
        // 캔버스에 붙은 요소들: 플러그인이 붙이는 차례대로 (use)
        el: { children: [], get lastElementChild() { return this.children[this.children.length - 1] || null } },
        mouse: { x: 0, y: 0 },
        transform,
        zoom: (k, ox, oy) => { log.push(['zoom', k, ox, oy]); transform.k = k; this.fire('zoomed') },
        translate: (x, y) => { log.push(['translate', x, y]); transform.x = x; transform.y = y; this.fire('translated') }
      },
      container: { clientWidth: 1000, clientHeight: 600 },
      nodes: new Map(),
      connections: new Map(),
      resize: () => { log.push(['resize']) }
    }
  }

  // 진짜처럼: 연결 플러그인은 손에 든 선의 요소를, 영역 플러그인은 배경을 캔버스에 붙인다
  use(plugin, options) {
    this.plugins.set(plugin.name, options)
    if (plugin.name === 'connection') this.view.area.el.children.push(this.pickerLine)
    if (plugin.name === 'area') this.view.area.el.children.push({ childElementCount: 0 })
  }

  on(names, handler) { for (const name of [names].flat()) this.handlers.set(name, [...(this.handlers.get(name) || []), handler]) }
  register(component) { this.registered.push(component) }
  exist(name) { return name === 'isreadonly' && this.hasReadonly }
  trigger(name) { return name === 'isreadonly' ? this.isReadonly : undefined }
  // 테스트가 부른다: 그 이벤트에 걸린 것들을 차례로 부르고 답을 모은다
  fire(name, ...args) { return (this.handlers.get(name) || []).map(handler => handler(...args)) }
  toJSON() {
    return {
      id: this.id,
      nodes: Object.fromEntries(this.nodes.map(node => [node.id, { id: node.id }])),
      links: [...this.view.connections.keys()].map(connection => [connection.output.node.id, connection.input.node.id])
    }
  }

  async fromJSON(json) { log.push(['fromJSON', json]) }
  addNode(node) {
    this.nodes.push(node)
    this.view.nodes.set(node, nodeView(node))
    log.push(['addNode', node.id])
    this.fire('nodecreate', node)
  }

  // 진짜처럼: 듣는 것 하나라도 false를 답하면 연결을 만들지 않는다 (만들기 전에 묻는다)
  connect(output, input, data) {
    const connection = { output, input, data }
    log.push(['connect', output.node.id, input.node.id])
    if (this.fire('connectioncreate', connection).includes(false)) return

    this.view.connections.set(connection, { el: element() })
  }

  removeConnection(connection) {
    if (this.fire('connectionremove', connection).includes(false)) return

    this.view.connections.delete(connection)
    this.fire('connectionremoved', connection)
  }

  removeNode(node) { log.push(['removeNode', node.id]) }
}

class FakeEngine {
  constructor(id) {
    this.id = id
    this.registered = []
  }

  register(component) { this.registered.push(component) }
  async abort() { log.push(['abort']) }
  async process(json) { log.push(['process', json]) }
}

class FakeSiteNode {
  constructor() { this.name = 'Site' }
}

const plugin = name => ({ name })
const given = {
  cloneDeep,
  Rete: { NodeEditor: FakeEditor, Engine: FakeEngine },
  ConnectionPlugin: plugin('connection'),
  ConnectionPathPlugin: { ...plugin('path'), DEFAULT: 'default-path' },
  VueRenderPlugin: plugin('render'),
  ContextMenuPlugin: plugin('menu'),
  AreaPlugin: plugin('area'),
  ReadonlyPlugin: plugin('readonly'),
  SiteNode: FakeSiteNode,
  DEFAULT_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  fitView,
  fullCanvasIn,
  isRealSize,
  shownView,
  viewOf,
  arrangeLayout,
  boxOf,
  activeTerminalNode,
  hopKey,
  routeStates,
  isCanvasDoubleClick,
  lockedPress,
  closesLoop,
  loopIn,
  loopText,
  toastError
}
const body = script.replace(/^import .*\n/gm, '').replace('export default', 'return')
const component = runInThisContext(`(function (${imported.join(', ')}) {\n${body}\n})`)(...imported.map(name => given[name]))

// 화면 요소 하나: 붙은 class를 모아 둔다
function element() {
  const classes = new Set()
  return { classes, classList: { toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name) } } }
}
// 노드의 화면: 옮기면 노드의 위치가 바뀐다 (Rete처럼, 격자 맞춤은 없다)
function nodeView(node) {
  return { el: element(), translate: (x, y) => { log.push(['move', node.id, x, y]); node.position = [x, y] } }
}
let nextId = 1
// 노드 하나: 접속 정보의 화면(vueContext)이 값을 갖고 있다
function makeNode(connection = {}, position = [0, 0]) {
  const node = {
    id: nextId++,
    name: 'Site',
    position: [...position],
    data: { connection },
    controls: new Map([['connection', { vueContext: { ...connection, isLocked: false } }]]),
    update: vi.fn()
  }
  node.outputs = new Map([['output1', { node }]])
  node.inputs = new Map([['input1', { node }]])
  return node
}
// 캔버스에 이미 있는 노드
function put(editor, ...nodes) {
  for (const node of nodes) {
    editor.nodes.push(node)
    editor.view.nodes.set(node, nodeView(node))
  }
  return nodes
}
function link(editor, from, to) {
  const connection = { output: from.outputs.get('output1'), input: to.inputs.get('input1') }
  const view = { el: element() }
  editor.view.connections.set(connection, view)
  return view
}
// 이벤트가 일어난 곳: closest()가 그 선택자들 가운데 하나를 찾는다
const targetIn = (...inside) => ({ closest: selector => (selector.split(', ').some(part => inside.includes(part)) ? {} : null) })

const EMPTY = JSON.stringify({ id: 'test@0.1.0', nodes: {} })
let observers = []

// 가짜 this: created()와 mounted()를 거친 캔버스. area는 캔버스 영역(#editor-area), room은 패널과 나눠 쓰는 #workspace.
function setup({ editorData = EMPTY, isLocked = false, getters = {}, answers = [], area = [1000, 600], room = [1000, 800] } = {}) {
  const listeners = []
  const listen = on => (name, handler, capture = false) => { listeners.push({ on, name, handler, capture }) }
  const unlisten = on => (name, handler, capture = false) => {
    const index = listeners.findIndex(x => x.on === on && x.name === name && x.handler === handler && x.capture === capture)
    if (index >= 0) listeners.splice(index, 1)
  }
  const roomEl = { clientWidth: room[0], clientHeight: room[1] }
  const areaEl = { clientWidth: area[0], clientHeight: area[1], parentElement: roomEl }
  const $el = {
    parentElement: areaEl,
    addEventListener: listen('canvas'),
    removeEventListener: unlisten('canvas'),
    dispatchEvent: event => { log.push(['dispatch', event]) }
  }
  vi.stubGlobal('document', { querySelector: selector => (selector === '#rete' ? $el : null), createElement: tag => ({ tag }) })
  vi.stubGlobal('window', { addEventListener: listen('window'), removeEventListener: unlisten('window') })

  const vm = {
    ...component.data(),
    editorData,
    isLocked,
    $el,
    $store: { getters: { terminalSessions: [], activeTerminalKey: null, isTerminalPanelOpen: true, ...getters } },
    $emit: (name, ...args) => { log.push(['emit', name, ...args]) },
    $bvToast: { toast: (text, options) => { log.push(['toast', text, options]) } },
    $bvModal: { msgBoxConfirm: async (text, options) => { log.push(['confirm', text, options]); return answers.shift() } },
    $nextTick: async () => { log.push(['nextTick']) }
  }
  for (const [name, method] of Object.entries(component.methods)) vm[name] = method.bind(vm)
  for (const [name, getter] of Object.entries(component.computed)) Object.defineProperty(vm, name, { get: getter.bind(vm), enumerable: true })
  component.created.call(vm)
  component.mounted.call(vm)
  // 그 이벤트를 듣는 것 하나를 찾아 부른다
  const dispatch = (on, name, event) => listeners.filter(x => x.on === on && x.name === name).map(x => x.handler(event))

  return { vm, editor: vm.editor, engine: vm.engine, listeners, dispatch, areaEl, roomEl, $el }
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
// 보기를 바꾼 것만 (zoom, translate)
const moves = () => log.filter(entry => entry[0] === 'zoom' || entry[0] === 'translate')

beforeEach(() => {
  vi.useFakeTimers()
  log = []
  observers = []
  nextId = 1
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) {
      this.callback = callback
      this.observed = []
      this.isConnected = true
      observers.push(this)
    }

    observe(target) { this.observed.push(target) }
    disconnect() { this.isConnected = false }
  })
  vi.stubGlobal('PointerEvent', class {
    constructor(type, init) {
      this.type = type
      this.init = init
    }
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('setting the canvas up', () => {
  // 컴포넌트가 새로 불러오는 것이 생기면 여기에도 주어야 한다 (없으면 undefined로 돌게 된다)
  it('is run here with everything it imports', () => {
    expect(imported.filter(name => !(name in given))).toEqual([])
    expect(imported).toHaveLength(Object.keys(given).length)
  })

  it('makes the editor on #rete with the plugins and their options, and one engine for the same nodes', () => {
    const { editor, engine, $el } = setup()

    expect(editor.id).toBe('test@0.1.0')
    expect(editor.container).toBe($el)
    expect([...editor.plugins.keys()]).toEqual(['connection', 'render', 'menu', 'area', 'path', 'readonly'])
    // 확대의 범위는 저장할 때 검사하는 범위와 같다 (shared/view.js)
    expect(editor.plugins.get('area')).toEqual({ background: { tag: 'div', classList: 'background' }, snap: true, scaleExtent: { min: MIN_ZOOM, max: MAX_ZOOM } })
    expect(editor.plugins.get('path').type).toBe('default-path')
    expect(editor.plugins.get('readonly')).toEqual({ enabled: true })
    expect(engine.id).toBe('test@0.1.0')
    expect(editor.registered.map(x => x.name)).toEqual(['Site'])
    expect(engine.registered).toEqual(editor.registered)
  })

  it('starts with no view remembered, nothing being added and no removal confirmed', () => {
    const { vm } = setup()

    expect(vm.base).toBeNull()
    expect(vm.isRescaling).toBe(false)
    expect(vm.isAdding).toBe(false)
    expect(vm.isReleasing).toBe(false)
    expect(vm.confirmedRemoval).toBeNull()
  })

  // 터미널 패널은 창 크기를 바꾸지 않고 캔버스의 높이를 바꾼다. 크기 없이 기억된 보기는 #workspace의 크기를 따른다.
  it('follows the size of the canvas area and of the workspace: Rete fixes its size and the view is scaled again', () => {
    const { vm, areaEl, roomEl } = setup()
    vm.base = { view: { k: 1, x: 100, y: 50 }, size: { width: 1000, height: 600 } }

    expect(observers).toHaveLength(1)
    expect(observers[0].observed).toEqual([areaEl, roomEl])

    areaEl.clientHeight = 300
    observers[0].callback()

    expect(log.map(entry => entry[0])).toEqual(['resize', 'zoom', 'translate'])
  })

  it('takes its listeners and its observer away when it is destroyed', () => {
    const { vm, listeners } = setup()

    expect(listeners.map(x => [x.on, x.name, x.capture])).toEqual([['canvas', 'dblclick', false], ['window', 'pointerup', true], ['canvas', 'pointerdown', true]])

    component.beforeDestroy.call(vm)

    expect(listeners).toEqual([])
    expect(observers[0].isConnected).toBe(false)
  })

  it('can be destroyed before it was set up', () => {
    const vm = { $el: { removeEventListener() {} } }
    vi.stubGlobal('window', { removeEventListener() {} })

    expect(() => component.beforeDestroy.call(vm)).not.toThrow()
  })
})

describe('the view the user chose and the view that is shown', () => {
  it('remembers a moved or zoomed canvas with the size of the area, and tells the layout in rounded numbers', () => {
    const { vm, editor } = setup({ area: [1000, 600] })
    Object.assign(editor.view.area.transform, { k: 1.23456, x: 10.26, y: -20.04 })

    editor.fire('translated')

    expect(vm.base).toEqual({ view: { k: 1.23456, x: 10.26, y: -20.04 }, size: { width: 1000, height: 600 } })
    expect(emitted('view-change')).toEqual([[{ k: 1.235, x: 10.3, y: -20, w: 1000, h: 600 }]])

    editor.fire('zoomed')
    expect(emitted('view-change')).toHaveLength(2)
  })

  // 접힌 영역(최대화한 터미널 패널 아래)의 크기는 크기가 아니다
  it('leaves the size out of what it tells when the area has none', () => {
    const { editor } = setup({ area: [1000, 0] })

    editor.fire('zoomed')

    expect(emitted('view-change')).toEqual([[{ k: 1, x: 0, y: 0 }]])
  })

  it('shows what it remembers scaled to the area of now, and what it remembers stays', () => {
    const { vm, areaEl } = setup({ area: [1000, 600] })
    vm.base = { view: { k: 1, x: 100, y: 50 }, size: { width: 1000, height: 600 } }
    areaEl.clientHeight = 300

    vm.rescaleView()

    // 높이가 반이면 반으로 줄고, 영역의 가운데에 있던 점은 가운데에 남는다
    expect(moves()).toEqual([['zoom', 0.5, 0, 0], ['translate', 300, 25]])
    // 맞추느라 바뀐 보기는 사용자의 것이 아니다: 기억하지도 알리지도 않는다
    expect(vm.base).toEqual({ view: { k: 1, x: 100, y: 50 }, size: { width: 1000, height: 600 } })
    expect(emitted('view-change')).toEqual([])
    expect(vm.isRescaling).toBe(false)
  })

  it('counts changes of the view as the user\'s again after a rescale that failed', () => {
    const { vm, editor } = setup()
    vm.base = { view: { k: 1, x: 0, y: 0 }, size: { width: 1000, height: 600 } }
    editor.view.area.zoom = () => { throw new Error('no area') }

    expect(() => vm.rescaleView()).toThrow('no area')
    expect(vm.isRescaling).toBe(false)
  })

  it('has nothing to show before a view is remembered', () => {
    const { vm } = setup()

    vm.rescaleView()

    expect(moves()).toEqual([])
  })

  it('opens a saved view with the size it was saved with', () => {
    const { vm } = setup({ area: [1000, 300] })

    vm.openView({ k: 1, x: 100, y: 50, w: 1000, h: 600 })

    expect(vm.base).toEqual({ view: { k: 1, x: 100, y: 50 }, size: { width: 1000, height: 600 } })
    expect(moves()).toEqual([['zoom', 0.5, 0, 0], ['translate', 300, 25]])
    expect(emitted('view-change')).toEqual([])
  })

  // 한 번도 옮기지 않은 다이어그램, 예전 파일: 패널이 없는 캔버스에서의 보기로 친다. 여는 순간의 영역 크기를 그 크기로 삼지 않는다.
  it.each([
    ['no size', {}],
    ['a width only', { w: 1000 }],
    ['a height of 0', { w: 1000, h: 0 }]
  ])('opens a view saved with %s as a view of the canvas without the terminal panel', (name, size) => {
    const { vm } = setup({ area: [1000, 400], room: [1000, 800] })

    vm.openView({ k: 0.8, x: 0, y: 0, ...size })

    expect(vm.base).toEqual({ view: { k: 0.8, x: 0, y: 0 }, size: null })
    // 패널이 캔버스의 반을 차지한다: 반으로 줄여서 보여준다
    expect(moves()).toEqual([['zoom', 0.4, 0, 0], ['translate', 250, 0]])
  })

  it('Reset view goes back to the starting view, remembers it without a size and tells the layout', () => {
    const { vm } = setup({ area: [1000, 400], room: [1000, 800] })
    vm.base = { view: { k: 2, x: 5, y: 5 }, size: { width: 1000, height: 400 } }

    vm.resetView()

    expect(vm.base).toEqual({ view: DEFAULT_VIEW, size: null })
    expect(vm.base.view).not.toBe(DEFAULT_VIEW)
    expect(emitted('view-change')).toEqual([[{ ...DEFAULT_VIEW }]])
    // 패널이 열려 있으면 다른 보기처럼 줄여서 보여준다
    expect(moves()).toEqual([['zoom', DEFAULT_VIEW.k / 2, 0, 0], ['translate', 250, 0]])
  })

  it('Reset view shows exactly the starting view when no terminal panel takes room', () => {
    const { vm } = setup({ area: [1000, 800], room: [1000, 800] })

    vm.resetView()

    expect(moves()).toEqual([['zoom', DEFAULT_VIEW.k, 0, 0], ['translate', 0, 0]])
  })

  it('sets a view by zooming at the origin first and moving then', () => {
    const { vm } = setup()

    vm.setView({ k: 1.5, x: 30, y: -40 })

    expect(log.slice(0, 1)).toEqual([['zoom', 1.5, 0, 0]])
    expect(moves()).toEqual([['zoom', 1.5, 0, 0], ['translate', 30, -40]])
  })

  it('measures the canvas area and the workspace it shares with the terminal panel', () => {
    const { vm } = setup({ area: [900, 350], room: [900, 700] })

    expect(vm.areaSize()).toEqual({ width: 900, height: 350 })
    expect(vm.fullSize()).toEqual({ width: 900, height: 700 })
  })
})

describe('a double click on the canvas', () => {
  it('is never Rete\'s zoom', () => {
    const { editor } = setup()

    expect(editor.fire('zoom', { source: 'dblclick' })).toEqual([false])
    expect(editor.fire('zoom', { source: 'wheel' })).toEqual([true])
  })

  it('resets the view on the empty canvas', () => {
    const { dispatch } = setup()

    dispatch('canvas', 'dblclick', { target: targetIn() })

    expect(emitted('view-change')).toEqual([[{ ...DEFAULT_VIEW }]])
  })

  it('does nothing while no diagram is open', () => {
    const { dispatch } = setup({ editorData: null })

    dispatch('canvas', 'dblclick', { target: targetIn() })

    expect(emitted('view-change')).toEqual([])
  })

  it('on a node resets the view only while the diagram is locked, and never on a line or the menu', () => {
    const unlocked = setup({ isLocked: false })
    unlocked.dispatch('canvas', 'dblclick', { target: targetIn('.node') })
    expect(emitted('view-change')).toEqual([])

    const locked = setup({ isLocked: true })
    locked.dispatch('canvas', 'dblclick', { target: targetIn('.node') })
    expect(emitted('view-change')).toHaveLength(1)

    locked.dispatch('canvas', 'dblclick', { target: targetIn('.node', 'button') })
    locked.dispatch('canvas', 'dblclick', { target: targetIn('.connection') })
    locked.dispatch('canvas', 'dblclick', { target: targetIn('.context-menu') })
    expect(emitted('view-change')).toHaveLength(1)
  })
})

describe('connecting two nodes', () => {
  // 놓는 순간에 소켓을 고르면 끌어서 놓기가 된다 (Windows에서 선이 이어지지 않고 남았다)
  it('picks a socket on a press, never on the release of a press', () => {
    const { editor, dispatch } = setup()

    expect(editor.fire('connectionpick')).toEqual([true])

    dispatch('window', 'pointerup', {})
    expect(editor.fire('connectionpick')).toEqual([false])

    // 놓는 일이 끝난 다음 차례부터는 다시 고를 수 있다
    vi.advanceTimersByTime(0)
    expect(editor.fire('connectionpick')).toEqual([true])
  })

  // 연결 플러그인은 왼쪽 소켓을 든 채 누른 왼쪽 소켓의 연결을 지우고 아무것도 잇지 않는다 (pickInput).
  // 손에 든 소켓은 버튼을 놓을 때 connectiondrop으로 알려지고, 들고 있는 동안에는 선의 요소가 비어 있지 않다.
  describe('with a socket in the hand', () => {
    const out = node => node.outputs.get('output1')
    const into = node => node.inputs.get('input1')
    function holding(pick) {
      const result = setup()
      const [a, b] = put(result.editor, makeNode({ name: 'a' }), makeNode({ name: 'b' }))
      result.editor.fire('connectiondrop', pick(a))
      result.editor.pickerLine.childElementCount = 1
      return { ...result, a, b }
    }

    it('takes the line of the hand from the element the connection plugin put on the canvas', () => {
      const { vm, editor } = setup()

      expect(vm.heldLine).toBe(editor.pickerLine)
      expect(editor.view.area.el.children).toHaveLength(2)
    })

    it('does not pick a left socket while a left socket is in the hand', () => {
      const { editor, a, b } = holding(into)

      expect(editor.fire('connectionpick', into(b))).toEqual([false])
      expect(editor.fire('connectionpick', into(a))).toEqual([false])
    })

    it('picks a right socket while a left socket is in the hand (the link is made from there)', () => {
      const { editor, a, b } = holding(into)

      expect(editor.fire('connectionpick', out(b))).toEqual([true])
      expect(editor.fire('connectionpick', out(a))).toEqual([true])
    })

    it('picks any socket while a right socket is in the hand', () => {
      const { editor, a, b } = holding(out)

      expect(editor.fire('connectionpick', into(b))).toEqual([true])
      expect(editor.fire('connectionpick', into(a))).toEqual([true])
      expect(editor.fire('connectionpick', out(b))).toEqual([true])
    })

    // 떨어뜨린 소켓도 connectiondrop으로 알려진다 (떨어뜨리기 전에). 손이 비었는지는 선의 요소로 안다.
    it('picks a left socket again once the hand is empty, whatever was in it before', () => {
      const { editor, a, b } = holding(into)

      editor.pickerLine.childElementCount = 0
      expect(editor.fire('connectionpick', into(b))).toEqual([true])
      expect(editor.fire('connectionpick', into(a))).toEqual([true])
    })

    it('picks nothing on the release of a press, with or without a socket in the hand', () => {
      const { editor, b, dispatch } = holding(out)

      dispatch('window', 'pointerup', {})
      expect(editor.fire('connectionpick', into(b))).toEqual([false])
    })
  })

  // 고리가 있으면 Rete의 엔진이 다이어그램 전체의 계산을 거부한다 (utils/link-loop.js). 그래서 고리를 닫는 연결은 받지 않는다.
  describe('a link that would close a loop', () => {
    const HINT = ['Not linked: that link would make a loop.', { variant: 'secondary', solid: true, noCloseButton: true, autoHideDelay: 2500, toaster: 'b-toaster-bottom-center' }]
    const out = node => node.outputs.get('output1')
    const into = node => node.inputs.get('input1')
    const linkOf = (editor, from, to) => [...editor.view.connections.keys()].find(c => c.output.node === from && c.input.node === to)
    const links = editor => [...editor.view.connections.keys()].map(c => `${c.output.node.id}>${c.input.node.id}`)
    // 1 -> 2 -> 3, 그리고 4 -> 1 (노드 1의 입력에는 이미 연결이 있다)
    function chain() {
      const result = setup()
      const [a, b, c, x] = put(result.editor, makeNode({ name: 'a' }), makeNode({ name: 'b' }), makeNode({ name: 'c' }), makeNode({ name: 'x' }))
      link(result.editor, a, b)
      link(result.editor, b, c)
      link(result.editor, x, a)
      return { ...result, a, b, c, x }
    }

    it('is not made, and a hint says so', () => {
      const { editor, a, b, c } = chain()

      expect(editor.fire('connectioncreate', { output: out(c), input: into(b) })).toContain(false)
      editor.connect(out(c), into(b))
      expect(links(editor)).toEqual(['1>2', '2>3', '4>1'])
      expect(logged('toast')).toEqual([HINT])

      // 길의 끝에서 처음으로 돌아가는 연결, 제 자신으로 가는 연결
      vi.advanceTimersByTime(2500)
      editor.connect(out(c), into(a))
      vi.advanceTimersByTime(2500)
      editor.connect(out(a), into(a))
      expect(links(editor)).toEqual(['1>2', '2>3', '4>1'])
      expect(logged('toast')).toEqual([HINT, HINT, HINT])
    })

    it('leaves every other link alone', () => {
      const { editor, a, c, x } = chain()
      const [d] = put(editor, makeNode({ name: 'd' }))

      expect(editor.fire('connectioncreate', { output: out(c), input: into(d) })).not.toContain(false)
      editor.connect(out(c), into(d))
      editor.connect(out(x), into(c))
      editor.connect(out(a), into(c))
      expect(links(editor)).toEqual(['1>2', '2>3', '4>1', '3>5', '4>3', '1>3'])
      expect(logged('toast')).toEqual([])
    })

    it('shows one hint at a time: no second one while the first is on the screen', () => {
      const { editor, a, c } = chain()

      editor.connect(out(c), into(a))
      editor.connect(out(c), into(a))
      vi.advanceTimersByTime(2499)
      editor.connect(out(c), into(a))
      expect(logged('toast')).toEqual([HINT])

      vi.advanceTimersByTime(1)
      editor.connect(out(c), into(a))
      expect(logged('toast')).toEqual([HINT, HINT])
    })

    // 저장된 다이어그램은 고리가 있어도 있는 그대로 열린다 (Rete는 불러오는 동안 silent다)
    it('is made while a diagram is being loaded', () => {
      const { editor, a, c } = chain()

      editor.silent = true
      editor.connect(out(c), into(a))
      expect(links(editor)).toEqual(['1>2', '2>3', '4>1', '3>1'])
      expect(logged('toast')).toEqual([])
    })

    // 연결 플러그인은 도착 소켓에 있던 연결을 먼저 지우고 나서 새 연결을 만든다 (rete-connection-plugin의 pickInput)
    it('puts back the link the plugin took away for it, with its data', async () => {
      const { editor, a, c, x } = chain()
      const old = linkOf(editor, x, a)
      old.data = { kept: true }

      editor.removeConnection(old)
      editor.connect(out(c), into(a))
      expect(links(editor)).toEqual(['1>2', '2>3'])

      await flush()
      expect(links(editor)).toEqual(['1>2', '2>3', '4>1'])
      expect(linkOf(editor, x, a).data).toEqual({ kept: true })
      expect(logged('toast')).toEqual([HINT])

      // 되돌린 다음에도 고리는 받지 않는다
      vi.advanceTimersByTime(2500)
      editor.connect(out(c), into(a))
      await flush()
      expect(links(editor)).toEqual(['1>2', '2>3', '4>1'])
      expect(logged('toast')).toEqual([HINT, HINT])
    })

    // 파일에서 온 고리의 연결이었더라도 있던 그대로 돌아간다: 거절은 아무것도 바꾸지 않는다
    it('puts it back even where that link is part of a loop that was there before', async () => {
      const { editor } = setup()
      const [a, b] = put(editor, makeNode({ name: 'a' }), makeNode({ name: 'b' }))
      link(editor, a, b)
      link(editor, b, a)

      editor.removeConnection(linkOf(editor, a, b))
      editor.connect(out(a), into(b))
      await flush()

      expect(links(editor)).toEqual(['2>1', '1>2'])
      expect(logged('toast')).toEqual([HINT])
    })

    it('does not put back a link that was taken away earlier (picked up and dropped on a socket it cannot go to)', async () => {
      const { editor, a, c, x } = chain()

      editor.removeConnection(linkOf(editor, x, a))
      vi.advanceTimersByTime(0)
      editor.connect(out(c), into(a))
      await flush()

      expect(links(editor)).toEqual(['1>2', '2>3'])
      expect(logged('toast')).toEqual([HINT])
    })

    it('does not put back a link that led into another node', async () => {
      const { editor, a, b, c } = chain()

      editor.removeConnection(linkOf(editor, b, c))
      editor.connect(out(b), into(a))
      await flush()

      expect(links(editor)).toEqual(['1>2', '4>1'])
    })

    it('does not put back a link that went with the diagram loaded before', async () => {
      const { editor, a, c, x } = chain()

      editor.silent = true
      editor.removeConnection(linkOf(editor, x, a))
      editor.silent = false
      editor.connect(out(c), into(a))
      await flush()

      expect(links(editor)).toEqual(['1>2', '2>3'])
    })
  })
})

describe('a locked diagram', () => {
  it('opens no right-click menu and says why', () => {
    const { editor } = setup({ isLocked: true })

    expect(editor.fire('showcontextmenu')).toEqual([false])
    expect(logged('toast')).toEqual([['Unlock the editor (lock icon) to add or delete nodes.', {
      variant: 'secondary', solid: true, noCloseButton: true, autoHideDelay: 2500, toaster: 'b-toaster-bottom-center'
    }]])
  })

  it('opens the menu as usual when it is not locked', () => {
    const { editor } = setup({ isLocked: false })

    expect(editor.fire('showcontextmenu')).toEqual([undefined])
    expect(logged('toast')).toEqual([])
  })

  it('says it once for presses in a row, and again four seconds later', () => {
    const { vm } = setup({ isLocked: true })
    vi.setSystemTime(100000)

    vm.showLockedHint()
    vi.setSystemTime(103999)
    vm.showLockedHint()
    expect(logged('toast')).toHaveLength(1)

    vi.setSystemTime(104000)
    vm.showLockedHint()
    expect(logged('toast')).toHaveLength(2)
  })

  it('says nothing while no diagram is open', () => {
    const { vm } = setup({ editorData: null, isLocked: true })

    vm.showLockedHint()

    expect(logged('toast')).toEqual([])
  })

  it('tells every node whether the editor is locked, when a node is drawn and when the lock changes', () => {
    const { editor } = setup()
    const [a, b] = put(editor, makeNode(), makeNode())
    const locks = () => [a, b].map(node => node.controls.get('connection').vueContext.isLocked)

    editor.isReadonly = true
    editor.fire('rendernode')
    expect(locks()).toEqual([true, true])

    editor.isReadonly = false
    editor.fire('readonly', false)
    expect(locks()).toEqual([false, false])

    // 잠금 플러그인이 아직 없으면 잠기지 않은 것이다
    editor.isReadonly = true
    editor.hasReadonly = false
    editor.fire('rendernode')
    expect(locks()).toEqual([false, false])
  })

  // 잠긴 동안에는 선택을 풀 수 없어서, 편집 중에 누른 노드가 선택된 모양으로 남았다
  it('drops the selection when the editor is locked, and redraws the nodes that were selected', () => {
    const { editor } = setup()
    const [a, b] = put(editor, makeNode(), makeNode())
    const removed = makeNode()
    const plain = { ...makeNode(), update: undefined }
    put(editor, plain)
    editor.selected.list = [a, removed, plain]

    editor.fire('readonly', true)

    expect(editor.selected.list).toEqual([])
    expect(a.update).toHaveBeenCalledTimes(1)
    expect(b.update).not.toHaveBeenCalled()
    // 지운 노드는 선택 목록에 남아 있어도 다시 그리지 않는다
    expect(removed.update).not.toHaveBeenCalled()
  })

  it('keeps the selection when the editor is unlocked', () => {
    const { editor } = setup()
    const [a] = put(editor, makeNode())
    editor.selected.list = [a]

    editor.fire('readonly', false)

    expect(editor.selected.list).toEqual([a])
    expect(a.update).not.toHaveBeenCalled()
  })

  // Rete는 노드 위의 누름을 노드의 것으로 삼고 멈춘다. 닿기 전에(capture) 멈추고 같은 누름을 캔버스에 다시 보낸다.
  it('hands a press on a node to the canvas, so a drag that starts on a node moves the canvas', () => {
    const { dispatch } = setup({ isLocked: true })
    const press = { target: targetIn('.node'), pointerType: 'mouse', button: 0, stopPropagation: vi.fn() }

    dispatch('canvas', 'pointerdown', press)

    expect(press.stopPropagation).toHaveBeenCalledTimes(1)
    // 캔버스 자신에게 보낸다 (가짜 캔버스의 dispatchEvent가 적어 둔다)
    const [[sent]] = logged('dispatch')
    expect(sent).toBeInstanceOf(globalThis.PointerEvent)
    expect(sent.type).toBe('pointerdown')
    expect(sent.init).toBe(press)
  })

  it.each([
    ['a button of the node', { isLocked: true }, targetIn('.node', 'button'), 0],
    ['the empty canvas', { isLocked: true }, targetIn(), 0],
    ['a node with the right button', { isLocked: true }, targetIn('.node'), 2],
    ['a node of an unlocked diagram', { isLocked: false }, targetIn('.node'), 0]
  ])('leaves a press on %s alone', (name, props, target, button) => {
    const { dispatch } = setup(props)
    const press = { target, pointerType: 'mouse', button, stopPropagation: vi.fn() }

    dispatch('canvas', 'pointerdown', press)

    expect(press.stopPropagation).not.toHaveBeenCalled()
    expect(logged('dispatch')).toEqual([])
  })
})

describe('removing a node', () => {
  const filled = [
    ['a name', { name: 'web' }],
    ['a user', { user: 'ops' }],
    ['a host', { host: 'web.example' }],
    ['a port', { port: '22' }],
    ['a key path', { keyPath: '~/.ssh/id' }],
    ['a password', { password: 'x' }],
    ['a command', { exec: 'uptime' }],
    ['a forward', { forwards: [{}] }]
  ]

  it.each(filled)('a node with %s has content', (name, connection) => {
    const { vm } = setup()

    expect(vm.nodeHasContent(makeNode(connection))).toBe(true)
  })

  it('a node with nothing filled in has none', () => {
    const { vm } = setup()

    expect(vm.nodeHasContent(makeNode())).toBe(false)
    expect(vm.nodeHasContent(makeNode({ name: '', host: '', forwards: [] }))).toBe(false)
  })

  it('is asked about first when the node has content: the removal is refused and the question opens', async () => {
    const { editor } = setup({ answers: [false] })
    const [node] = put(editor, makeNode({ name: 'web', host: 'web.example' }))

    // 첫 답이 확인을 거치는 쪽이다 (둘째는 다시 계산하는 쪽)
    expect(editor.fire('noderemove', node)[0]).toBe(false)
    await flush()

    expect(logged('confirm')).toEqual([['Delete "web"?', { title: 'Delete node', okVariant: 'danger', okTitle: 'Delete' }]])
    expect(logged('removeNode')).toEqual([])
  })

  it('goes on after a yes: the node is removed again, and that second removal is let through', async () => {
    const { vm, editor } = setup({ answers: [true] })
    const [node] = put(editor, makeNode({ host: 'web.example' }))
    const seen = []
    editor.removeNode = removed => { seen.push([removed, vm.confirmedRemoval, editor.fire('noderemove', removed)[0]]) }

    expect(editor.fire('noderemove', node)[0]).toBe(false)
    await flush()

    // 이름이 없으면 주소로 묻는다
    expect(logged('confirm')[0][0]).toBe('Delete "web.example"?')
    expect(seen).toEqual([[node, node, true]])
    expect(vm.confirmedRemoval).toBeNull()
  })

  it('asks with a stand-in for a node that has neither a name nor a host', async () => {
    const { vm } = setup({ answers: [false] })

    await vm.confirmRemoval(makeNode({ user: 'ops' }))

    expect(logged('confirm')[0][0]).toBe('Delete "(untitled)"?')
  })

  it('is not asked about for an empty node, nor while a diagram is being loaded', () => {
    const { editor } = setup()
    const [empty, full] = put(editor, makeNode(), makeNode({ name: 'web' }))

    expect(editor.fire('noderemove', empty)[0]).toBe(true)

    editor.silent = true
    expect(editor.fire('noderemove', full)[0]).toBe(true)
    expect(logged('confirm')).toEqual([])
  })
})

describe('the sessions of the terminals on the canvas', () => {
  const server = host => ({ user: 'ops', host, port: '22' })
  const key = host => `ops@${host}:22`
  const sessions = [
    { key: 'k1', status: 'running', connected: true, hops: [key('a.example'), key('b.example')] },
    { key: 'k2', status: 'starting', hops: [key('c.example')] },
    { key: 'k3', status: 'exited', exitCode: 255, hops: [key('d.example')] }
  ]
  function canvas(getters) {
    const made = setup({ getters })
    const nodes = put(made.editor, ...['a', 'b', 'c', 'd', 'e'].map(name => makeNode(server(`${name}.example`))))
    const lines = [link(made.editor, nodes[0], nodes[1]), link(made.editor, nodes[1], nodes[4])]
    const marks = () => ({
      nodes: nodes.map(node => [...made.editor.view.nodes.get(node).el.classes].sort()),
      lines: lines.map(line => [...line.el.classes].sort())
    })
    return { ...made, nodes, marks }
  }

  it('marks the nodes and the lines a session runs along with its state, and the node of the selected tab', () => {
    const { vm, marks } = canvas({ terminalSessions: sessions, activeTerminalKey: 'k1' })

    vm.markLiveRoutes()

    expect(marks()).toEqual({
      nodes: [['is-live'], ['is-active-terminal', 'is-live'], ['is-connecting'], ['is-failed'], []],
      lines: [['is-live'], []]
    })
  })

  it('takes the marks away again when the sessions are gone', () => {
    const { vm, marks } = canvas({ terminalSessions: sessions, activeTerminalKey: 'k1' })
    vm.markLiveRoutes()

    vm.$store.getters.terminalSessions = []
    vm.markLiveRoutes()

    expect(marks()).toEqual({ nodes: [[], [], [], [], []], lines: [[], []] })
  })

  it('marks no node as the one of the selected tab while the panel is minimized', () => {
    const { vm, marks } = canvas({ terminalSessions: sessions, activeTerminalKey: 'k1', isTerminalPanelOpen: false })

    expect(vm.activeTerminalNode).toBeNull()
    vm.markLiveRoutes()

    expect(marks().nodes[1]).toEqual(['is-live'])
  })

  it('knows the node of the selected tab from the store: the last hop of that session', () => {
    const { vm } = canvas({ terminalSessions: sessions, activeTerminalKey: 'k1' })

    expect(vm.activeTerminalNode).toBe(key('b.example'))
    vm.$store.getters.activeTerminalKey = 'k2'
    expect(vm.activeTerminalNode).toBe(key('c.example'))
  })

  it('copes with a node whose settings are not drawn yet, and with no editor at all', () => {
    const { vm, editor } = canvas({ terminalSessions: sessions })
    const bare = { id: 99, controls: new Map() }
    editor.view.nodes.set(bare, nodeView(bare))

    expect(() => vm.markLiveRoutes()).not.toThrow()
    expect([...editor.view.nodes.get(bare).el.classes]).toEqual([])

    vm.editor = null
    expect(() => vm.markLiveRoutes()).not.toThrow()
  })

  it('is marked again when a session changes and when another tab is selected', () => {
    const { vm } = setup()
    vm.markLiveRoutes = vi.fn()

    expect(component.watch['$store.getters.terminalSessions'].deep).toBe(true)
    component.watch['$store.getters.terminalSessions'].handler.call(vm)
    expect(vm.markLiveRoutes).toHaveBeenCalledTimes(1)

    // 다른 탭을 고르면 세션은 그대로다: 따로 본다
    component.watch.activeTerminalNode.call(vm)
    expect(vm.markLiveRoutes).toHaveBeenCalledTimes(2)
  })
})

describe('loading a diagram and working its values out', () => {
  it('works the values out: stops a run, runs the engine on what is on the canvas, marks the sessions, returns the canvas', async () => {
    const { vm, editor } = setup()
    put(editor, makeNode(), makeNode())
    vm.markLiveRoutes = () => { log.push(['mark']) }

    const result = await vm.compile()

    expect(log).toEqual([['abort'], ['process', editor.toJSON()], ['abort'], ['mark']])
    expect(result).toEqual(editor.toJSON())
  })

  it('loads a diagram: the nodes, their number to the layout, the values, and the size of the canvas last', async () => {
    const { vm } = setup()
    const data = { id: 'test@0.1.0', nodes: { 1: { id: 1 } } }

    await vm.load(JSON.stringify(data))

    expect(log.map(entry => entry[0])).toEqual(['fromJSON', 'emit', 'abort', 'process', 'abort', 'resize'])
    expect(logged('fromJSON')).toEqual([[data]])
    expect(emitted('node-count')).toEqual([[0]])
  })

  // 예전 버전에서 그렸거나 파일에서 온 고리: 지금은 그릴 수 없지만 그런 다이어그램은 있는 그대로 열린다
  it('says so when the opened diagram has a loop in its links, and names its nodes in the order of the links', async () => {
    const { vm, editor } = setup()
    const [first, bastion, app, db] = put(editor, makeNode({ name: 'first' }), makeNode({ name: 'bastion', host: '10.0.0.1' }), makeNode({ host: '10.0.0.2' }), makeNode({ name: 'db' }))
    // first -> bastion -> (이름 없는 노드) -> db -> bastion: first는 고리로 들어가는 길일 뿐이다
    link(editor, first, bastion)
    link(editor, bastion, app)
    link(editor, app, db)
    link(editor, db, bastion)

    await vm.load(EMPTY)

    // 이름만 적는다 (주소는 가려 둘 수 있는 값이다). 이름이 없는 노드는 (untitled)
    expect(logged('toast')).toEqual([[loopText(['bastion', '(untitled)', 'db']), { title: 'Loop in the links', variant: 'danger', solid: true, bodyClass: 'msg-pre-line', autoHideDelay: 10000 }]])
    expect(loopText(['bastion', '(untitled)', 'db'])).toContain('bastion → (untitled) → db → bastion')
    // 다 불러온 다음에 알린다
    expect(log.map(entry => entry[0])).toEqual(['fromJSON', 'emit', 'abort', 'process', 'abort', 'resize', 'toast'])
  })

  it('says nothing when the opened diagram has links but no loop', async () => {
    const { vm, editor } = setup()
    const [a, b, c] = put(editor, makeNode({ name: 'a' }), makeNode({ name: 'b' }), makeNode({ name: 'c' }))
    link(editor, a, b)
    link(editor, a, c)

    await vm.load(EMPTY)

    expect(logged('toast')).toEqual([])
  })

  it.each(['connectioncreate', 'connectionremove', 'nodecreate', 'noderemove', 'process'])('works the values out again after %s', async name => {
    const { editor } = setup()
    const [from, to] = put(editor, makeNode(), makeNode())

    // 연결의 이벤트는 그 연결의 두 끝을, 노드의 이벤트는 노드를 받는다
    await Promise.all(editor.fire(name, name.startsWith('connection') ? { output: from.outputs.get('output1'), input: to.inputs.get('input1') } : makeNode()))

    expect(logged('process')).toHaveLength(1)
  })

  it('does not do so while a diagram is being loaded or several nodes are being added', async () => {
    const { vm, editor } = setup()

    editor.silent = true
    await Promise.all(editor.fire('nodecreate', makeNode()))
    editor.silent = false
    vm.isAdding = true
    const [from, to] = put(editor, makeNode(), makeNode())
    await Promise.all(editor.fire('connectioncreate', { output: from.outputs.get('output1'), input: to.inputs.get('input1') }))

    expect(logged('process')).toEqual([])
  })

  it('tells the layout how many nodes there are when one was made or removed', () => {
    const { editor } = setup()
    put(editor, makeNode(), makeNode(), makeNode())

    editor.fire('nodecreated')
    editor.fire('noderemoved')

    expect(emitted('node-count')).toEqual([[3], [3]])
  })

  it('loads the diagram that is opened, after stopping the engine', async () => {
    const { vm } = setup({ editorData: '{"id":"test@0.1.0","nodes":{"1":{}}}' })
    vm.load = data => { log.push(['load', data]) }

    await component.watch.editorData.call(vm)

    expect(log).toEqual([['abort'], ['load', '{"id":"test@0.1.0","nodes":{"1":{}}}']])
  })

  it('loads an empty canvas when the diagram is closed', async () => {
    const { vm } = setup({ editorData: null })
    vm.load = data => { log.push(['load', data]) }

    await component.watch.editorData.call(vm)

    expect(log).toEqual([['abort'], ['load', EMPTY]])
  })
})

// Rete의 엔진은 도는 중에 또 시작하면 새것을 받지 않고, 그 앞뒤의 abort가 돌던 것을 멈춘다: 겹친 계산은 하나도 끝까지 가지 못한다.
// 연결을 바꿔 끼우는 클릭 한 번이 그랬다 (같은 차례에 옛 연결을 지우고 새 연결을 만든다): 노드가 예전의 앞 노드들을 알고 있었다.
describe('working the values out, one calculation at a time', () => {
  // 붙잡아 둔 계산: 테스트가 끝내 줄 때까지 돌고 있다
  function hold(engine) {
    const runs = []
    engine.process = json => { log.push(['process', json]); return new Promise((resolve, reject) => { runs.push({ resolve, reject }) }) }
    return runs
  }

  it('works the changes of one task out together, once, as the canvas is after them', async () => {
    const { editor } = setup()
    const [first, middle, apart] = put(editor, makeNode(), makeNode(), makeNode())
    link(editor, middle, apart)
    const [old] = [...editor.view.connections.keys()]

    // 연결 플러그인이 연결을 바꿔 끼울 때처럼: 옛 연결을 지우고 곧바로 새 연결을 만든다
    editor.removeConnection(old)
    editor.connect(first.outputs.get('output1'), apart.inputs.get('input1'))
    await flush()

    expect(logged('process')).toEqual([[{ ...editor.toJSON(), links: [[first.id, apart.id]] }]])
  })

  it('starts a calculation that is asked for during another one after that one, and only one for all who ask meanwhile', async () => {
    const { vm, editor, engine } = setup()
    const [from, to] = put(editor, makeNode(), makeNode())
    const runs = hold(engine)

    const one = vm.compile()
    await flush()
    expect(logged('process')).toEqual([[{ ...editor.toJSON(), links: [] }]])

    // 계산이 도는 동안 캔버스가 바뀌고, 두 곳에서 계산을 맡긴다
    link(editor, from, to)
    const two = vm.compile()
    const three = vm.compile()
    await flush()
    expect(three).toBe(two)
    expect(two).not.toBe(one)
    // 도는 것이 끝날 때까지 기다린다 (겹치지 않는다)
    expect(logged('process')).toHaveLength(1)

    runs[0].resolve()
    await flush()
    expect(logged('process')).toHaveLength(2)
    expect(logged('process')[1]).toEqual([{ ...editor.toJSON(), links: [[from.id, to.id]] }])
    runs[1].resolve()

    expect(await two).toEqual(editor.toJSON())
    expect(await one).toEqual(editor.toJSON())
    // 계산 하나가 다 끝난 다음에(그 뒤의 abort까지) 다음 것이 시작한다
    expect(log.map(entry => entry[0])).toEqual(['abort', 'process', 'abort', 'abort', 'process', 'abort'])
  })

  it('works the values out again for a change that comes after a calculation has ended', async () => {
    const { vm } = setup()

    const one = vm.compile()
    await one
    const two = vm.compile()
    await two

    expect(two).not.toBe(one)
    expect(logged('process')).toHaveLength(2)
  })

  it('still starts the next calculation when the one before it failed', async () => {
    const { vm, engine } = setup()
    const runs = hold(engine)

    const one = vm.compile()
    await flush()
    const two = vm.compile()
    runs[0].reject(new Error('a worker failed'))
    await expect(one).rejects.toThrow('a worker failed')
    await flush()
    expect(logged('process')).toHaveLength(2)
    runs[1].resolve()

    await expect(two).resolves.toEqual(vm.editor.toJSON())
  })
})

describe('the right-click menu of the canvas', () => {
  it('calls its first item Add node and has no Clone', () => {
    const { editor } = setup()
    const menu = editor.plugins.get('menu')

    expect(menu.rename()).toBe('Add node')
    expect(menu.nodeItems.Clone).toBe(false)
    expect(Object.keys(menu.items)).toEqual(['From SSH config'])
  })

  it('From SSH config tells the layout where the pointer is on the canvas', () => {
    const { editor } = setup()
    editor.view.area.mouse = { x: 320, y: 140 }

    editor.plugins.get('menu').items['From SSH config']()

    expect(emitted('ssh-config')).toEqual([[[320, 140]]])
  })

  it('Duplicate makes a node with a copy of the values, a little down and to the right', async () => {
    const { editor } = setup()
    const made = []
    editor.components.set('Site', { createNode: async data => { made.push(data); return makeNode(data.connection) } })
    const original = makeNode({ name: 'web', forwards: [{ port: '8080' }] }, [100, 60])

    await editor.plugins.get('menu').nodeItems.Duplicate({ node: original })

    expect(made).toEqual([original.data])
    expect(made[0]).not.toBe(original.data)
    expect(made[0].connection.forwards[0]).not.toBe(original.data.connection.forwards[0])
    expect(editor.nodes).toHaveLength(1)
    expect(editor.nodes[0].position).toEqual([125, 85])
    expect(original.position).toEqual([100, 60])
  })
})

describe('nodes from a pasted SSH config', () => {
  const plan = { nodes: [{ name: 'jump', host: 'jump.example' }, { name: 'app', host: 'app.example' }], links: [[0, 1]] }
  function withSite(made = []) {
    const result = setup()
    result.editor.components.set('Site', { createNode: async data => { made.push(data); return makeNode(data.connection) } })
    return { ...result, made }
  }

  it('are made at the point with copies of the values, linked, worked out once, and placed after the redraw', async () => {
    const { vm, editor, made } = withSite()
    const origin = [120, 80]
    const placed = []
    vm.placeGroup = (nodes, at) => { placed.push([nodes.map(node => node.position), at, vm.isAdding]); log.push(['place']) }

    await vm.addFromConfig(plan, origin)

    expect(made).toEqual([{ connection: plan.nodes[0] }, { connection: plan.nodes[1] }])
    expect(made[0].connection).not.toBe(plan.nodes[0])
    const [jump, app] = editor.nodes
    expect(placed).toEqual([[[[120, 80], [120, 80]], origin, false]])
    expect(jump.position).not.toBe(origin)
    expect(app.position).not.toBe(jump.position)
    expect(logged('connect')).toEqual([[jump.id, app.id]])
    // 더하는 동안에는 계산하지 않는다: 노드마다 시작한 계산이 겹쳐서 값이 채워지지 않은 채 남았다
    expect(logged('process')).toHaveLength(1)
    // 노드 아래의 글자는 계산과 다시 그리기가 끝나야 채워진다. 그 뒤에 재서 놓는다.
    expect(log.map(entry => entry[0]).slice(-5)).toEqual(['abort', 'process', 'abort', 'nextTick', 'place'])
    expect(vm.isAdding).toBe(false)
  })

  it('works the values out again as usual after a failure in the middle', async () => {
    const { vm, editor } = setup()
    editor.components.set('Site', { createNode: async () => { throw new Error('no such node') } })

    await expect(vm.addFromConfig(plan, [0, 0])).rejects.toThrow('no such node')

    expect(vm.isAdding).toBe(false)
  })

  // Arrange nodes와 같은 규칙을 그 노드들에만 쓴다. 묶음의 왼쪽 위 노드의 상자 모서리가 누른 자리에 온다.
  it('are placed in the order of their links, with the corner of the first one at the point', () => {
    const { vm, editor } = setup()
    const [jump, app] = put(editor, makeNode({ name: 'jump' }), makeNode({ name: 'app' }))
    link(editor, jump, app)
    // 노드 밖으로 나온 글자와 소켓: 노드마다 다르다
    const extents = new Map([[jump, { dx: -10, dy: 0, width: 120, height: 80 }], [app, { dx: -30, dy: -5, width: 160, height: 90 }]])
    vm.extentOf = node => extents.get(node)

    vm.placeGroup([jump, app], [200, 100])

    expect(jump.position).toEqual([200, 100])
    // 다음 열: 앞 열의 너비와 열 사이의 틈만큼 오른쪽, 같은 줄. 밖으로 나온 만큼은 각자의 것을 뺀다.
    expect(app.position).toEqual([200 + 120 + ARRANGE_GAP.x + 30 - 10, 100 + 5])
  })

  it('are placed from top to bottom in the order of the text when nothing links them', () => {
    const { vm, editor } = setup()
    // 글의 순서는 노드 번호의 순서와 다르다
    const [three, one, two] = put(editor, makeNode({ name: 'three' }), makeNode({ name: 'one' }), makeNode({ name: 'two' }))
    vm.extentOf = () => ({ dx: 0, dy: 0, width: 100, height: 50 })

    vm.placeGroup([one, two, three], [40, 40])

    expect([one, two, three].map(node => node.position)).toEqual([[40, 40], [40, 40 + 50 + ARRANGE_GAP.y], [40, 40 + 2 * (50 + ARRANGE_GAP.y)]])
  })

  it('placing nothing does nothing', () => {
    const { vm } = setup()

    expect(() => vm.placeGroup([], [0, 0])).not.toThrow()
    expect(logged('move')).toEqual([])
  })
})

describe('Arrange nodes', () => {
  it('measures a node with what sticks out of its box: the text under it and the sockets, in canvas units', () => {
    const { vm, editor } = setup()
    const [node] = put(editor, makeNode())
    const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top })
    const asked = []
    Object.assign(editor.view.nodes.get(node).el, {
      getBoundingClientRect: () => rect(100, 100, 300, 200),
      querySelectorAll: selector => {
        asked.push(selector)
        // 이름과 주소(아래), 소켓(왼쪽), 그리고 그려지지 않은 것 하나
        return [rect(80, 200, 320, 260), rect(90, 140, 110, 160), rect(0, 0, 0, 0)].map(r => ({ getBoundingClientRect: () => r }))
      }
    })
    editor.view.area.transform.k = 2

    expect(vm.extentOf(node)).toEqual({ dx: -10, dy: 0, width: 120, height: 80 })
    expect(asked).toEqual(['.info-field, .socket'])
  })

  it('puts the nodes in the order of their links around the middle of the canvas and fits the view to them', () => {
    const { vm, editor } = setup({ area: [1000, 600], room: [1000, 800] })
    const [first, second] = put(editor, makeNode({}, [300, 80]), makeNode({}, [0, 0]))
    link(editor, first, second)
    const extent = { dx: -10, dy: -4, width: 120, height: 80 }
    vm.extentOf = () => extent
    // 지금 확대는 0.5: 노드 둘은 훨씬 크게도 들어가지만 정렬은 지금보다 확대하지 않는다
    Object.assign(editor.view.area.transform, { k: 0.5, x: 40, y: 20 })

    vm.arrangeNodes()

    // 패널이 열린 영역(1000 x 600)에서는 패널이 없는 캔버스(1000 x 800)가 그 높이로 줄어든 가운데 부분에 맞춘다
    const viewport = fullCanvasIn({ width: 1000, height: 600 }, { width: 1000, height: 800 })
    expect(viewport).toEqual({ left: 125, top: 0, width: 750, height: 600 })
    const positions = arrangeLayout([{ id: first.id, x: 300, y: 80, ...extent }, { id: second.id, x: 0, y: 0, ...extent }], [[first.id, second.id]])
    const cx = (500 - 40) / 0.5
    const cy = (300 - 20) / 0.5
    expect(logged('move')).toEqual([
      [first.id, cx + positions.get(first.id)[0] + 10, cy + positions.get(first.id)[1] + 4],
      [second.id, cx + positions.get(second.id)[0] + 10, cy + positions.get(second.id)[1] + 4]
    ])
    // 이어진 순서대로: 앞 노드가 왼쪽, 같은 줄
    expect(second.position[0] - first.position[0]).toBe(120 + ARRANGE_GAP.x)
    expect(second.position[1]).toBe(first.position[1])

    // 보기: 묶음의 가운데가 맞출 자리의 가운데에 온다. 확대는 지금 값을 넘지 않는다.
    const box = boxOf([first, second].map(node => ({ x: node.position[0] - 10, y: node.position[1] - 4, width: 120, height: 80 })))
    const fitted = fitView(viewport, box, 0.5)
    expect(moves()).toEqual([['zoom', fitted.k, 0, 0], ['translate', fitted.x, fitted.y]])
    expect(fitted.k).toBe(0.5)
    expect(fitView(viewport, box, MAX_ZOOM).k).toBeGreaterThan(1)
    expect((box.left + box.right) / 2 * fitted.k + fitted.x).toBeCloseTo(500)
    expect((box.top + box.bottom) / 2 * fitted.k + fitted.y).toBeCloseTo(300)
  })

  it('does nothing on an empty canvas', () => {
    const { vm } = setup()

    vm.arrangeNodes()

    expect(log).toEqual([])
  })
})
