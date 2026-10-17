import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Menu } from 'rete-context-menu-plugin'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import placedMenu from './context-menu'

// 오른쪽 클릭 메뉴(#267): 플러그인의 메뉴에 자리(utils/menu-place.js)와 밖을 누를 때의 닫기를 더한 것. DOM 없이 도는 테스트라서
// 메뉴를 그리지 않고, 메서드와 updated()를 가짜 this로 부른다 (Vue처럼 메서드는 this에 묶어 둔다).
const here = dirname(fileURLToPath(import.meta.url))

let documentListeners
beforeEach(() => {
  documentListeners = []
  vi.stubGlobal('document', {
    addEventListener: (...args) => documentListeners.push(args),
    removeEventListener: (name, fn, capture) => {
      documentListeners = documentListeners.filter(([n, f, c]) => !(n === name && f === fn && c === capture))
    }
  })
  vi.stubGlobal('window', { innerWidth: 1100, innerHeight: 800 })
})
afterEach(() => vi.unstubAllGlobals())

// 그려진 메뉴 하나: 218 x 98, 테두리 2px, 캔버스(#rete) 안에 있다. inside는 메뉴 안의 요소들이다.
function menuElement({ room = { left: 0, top: 44, right: 1100, bottom: 800 }, size = [218, 98], inside = [] } = {}) {
  const [width, height] = size
  return {
    contains: target => inside.includes(target),
    getBoundingClientRect: () => ({ width, height }),
    clientWidth: width - 4,
    clientHeight: height - 4,
    parentElement: { getBoundingClientRect: () => room }
  }
}
function menu(refs = {}) {
  const vm = { visible: false, x: 0, y: 0, args: null, cancelHide: vi.fn(), $refs: refs }
  for (const [name, method] of Object.entries(placedMenu.methods)) vm[name] = method.bind(vm)
  return vm
}

describe('the right-click menu', () => {
  it('is the menu of the plugin with the two additions', () => {
    expect(placedMenu.extends).toBe(Menu)
  })

  it('opens where the plugin opens it and listens to every press of the page, before anything else gets it', () => {
    const vm = menu()

    vm.show(300, 520, { node: 'n' })

    expect(vm).toMatchObject({ visible: true, x: 300, y: 520, args: { node: 'n' }, pointer: [300, 520] })
    expect(vm.cancelHide).toHaveBeenCalled()
    expect(documentListeners).toEqual([['pointerdown', vm.pressed, true]])
  })

  it('stops listening when it closes', () => {
    const vm = menu()
    vm.show(300, 520)

    vm.hide()

    expect(vm.visible).toBe(false)
    expect(documentListeners).toEqual([])
  })

  it('closes on a press outside it, not on one inside', () => {
    const item = { name: 'an item' }
    const vm = menu({ menu: menuElement({ inside: [item] }) })
    vm.show(300, 520)

    vm.pressed({ target: item })
    expect(vm.visible).toBe(true)

    vm.pressed({ target: { name: 'the header' } })
    expect(vm.visible).toBe(false)
    expect(documentListeners).toEqual([])
  })

  it('takes its place from the pointer after the plugin pushed it into the window', () => {
    const vm = menu({ menu: menuElement() })
    vm.show(1090, 790)
    // 플러그인의 updated()가 먼저 한 일: 창 안으로 밀어 넣었다 (fitViewport)
    Object.assign(vm, { x: 1100 - 214, y: 800 - 94 })

    placedMenu.updated.call(vm)

    expect([vm.x, vm.y]).toEqual([1090 - 2 - 218, 790 - 2 - 98])
  })

  it('opens inside the canvas, where the terminal panel does not cover it', () => {
    const vm = menu({ menu: menuElement({ room: { left: 0, top: 44, right: 1100, bottom: 520 } }) })
    vm.show(600, 500)

    placedMenu.updated.call(vm)

    expect([vm.x, vm.y]).toEqual([602, 400])
  })

  // 메뉴보다 작은 창에는 좋은 자리가 없다: 그때는 플러그인의 규칙을 따라서, 두 updated()가 같은 자리를 내고 Vue가 끝없이
  // 다시 그리지 않는다
  it('agrees with the plugin where the window is smaller than the menu', () => {
    vi.stubGlobal('window', { innerWidth: 150, innerHeight: 80 })
    const vm = menu({ menu: menuElement({ room: { left: 0, top: 44, right: 150, bottom: 80 } }) })
    vm.show(100, 60)

    placedMenu.updated.call(vm)

    expect([vm.x, vm.y]).toEqual([150 - 214, 80 - 94])
  })

  it('does nothing while it is closed or before it was opened', () => {
    const closed = menu()
    closed.show(300, 520)
    placedMenu.updated.call(closed)
    expect([closed.x, closed.y]).toEqual([300, 520])

    const fresh = menu({ menu: menuElement() })
    placedMenu.updated.call(fresh)
    expect([fresh.x, fresh.y]).toEqual([0, 0])
  })
})

// 설치된 플러그인에 기대는 것들. 앱이 묶는 빌드(package.json의 module)를 읽는다.
describe('what the menu takes from the installed rete-context-menu-plugin', () => {
  const require = createRequire(import.meta.url)
  const pkg = require.resolve('rete-context-menu-plugin/package.json')
  const plugin = readFileSync(join(dirname(pkg), require(pkg).module), 'utf8').replace(/\r\n/g, '\n')

  it('opens both menus with the vueComponent option, at the place of the pointer in the window', () => {
    expect(plugin).toMatch(/return h\(vueComponent \|\| Menu, \{/)
    expect(plugin).toMatch(/var _ref3 = \[e\.clientX, e\.clientY\],/)
    expect(plugin.match(/\}, vueComponent, /g)).toHaveLength(2)
  })

  it('keeps the place in x and y, sets it in show() and draws it as left and top', () => {
    expect(plugin).toMatch(/show: function show\(x, y\) \{\n.*\n\s+this\.visible = true;\n\s+this\.x = x;\n\s+this\.y = y;\n\s+this\.args = args;/)
    expect(plugin).toMatch(/top: this\.y \+ 'px',\n\s+left: this\.x \+ 'px'/)
  })

  it('pushes the menu into the window in its own updated(), which runs before ours', () => {
    expect(plugin).toMatch(/updated: function updated\(\) \{\n\s+if \(this\.\$refs\.menu\) \{\n\s+var _fitViewport = fitViewport\(\[this\.x, this\.y\], this\.\$refs\.menu\);/)
    expect(plugin).toMatch(/return \[Math\.min\(x, window\.innerWidth - element\.clientWidth\), Math\.min\(y, window\.innerHeight - element\.clientHeight\)\];/)
  })

  it('closes every way through the hide() of the menu', () => {
    expect(plugin).toMatch(/this\.\$root\.\$on\('show', this\.show\);\n\s+this\.\$root\.\$on\('hide', this\.hide\);/)
    // 빌드 안의 소스 맵에도 Menu.vue와 Item.vue의 글이 있다: 컴파일된 코드에만 있는 모양으로 찾는다
    expect(plugin).toMatch(/searchKeep: Function\n {2}\},\n {2}mixins: \[hideMixin\('hide'\)\],/)
    expect(plugin).toMatch(/this\.timeoutHide = debounce\(this\[hideMethod\], this\.delay\);/)
    expect(plugin).toMatch(/if \(this\.item\.onClick\) this\.item\.onClick\(this\.args\);\n\s+this\.\$root\.\$emit\('hide'\);/)
  })

  it('has the margins that context-menu.scss takes away', () => {
    expect(plugin).toMatch(/\.context-menu\[data-v-[0-9a-f]+\] \{\\n {2}left: 0;\\n {2}top: 0;\\n {2}position: fixed;\\n {2}padding: 10px;\\n {2}width: 120px;\\n {2}margin-top: -20px;\\n {2}margin-left: -60px;\\n\}/)
    const style = readFileSync(join(here, 'context-menu.scss'), 'utf8').replace(/\r\n/g, '\n')
    expect(style).toMatch(/\n {2}#rete & \{\n {4}width: max-content;\n {4}margin: 0;\n {2}\}/)
    expect(style.match(/^div\.context-menu \{\n([\s\S]*?)\n {2}#rete & \{/m)[1]).not.toMatch(/margin/)
  })
})
