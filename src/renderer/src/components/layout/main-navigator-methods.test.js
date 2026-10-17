import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import isEmpty from 'lodash/isEmpty'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasSavedPassword, listEmptyText, matchesKeyword, EXPORT_PASSWORD_WARNING } from '../../utils/project'
import { countByOwner, sessionsOf } from '../../utils/terminal-sessions'
import { closeTerminalsQuestion, terminalCountText } from '../../utils/terminal-view'
import { copyNavigatorItem, createNavigatorItem, emptyItemData, removeNavigatorItems, toProjectItems, SWITCHER_MENU_POPPER } from '../../utils/navigator-items'
import { diagramProblem } from '../../utils/diagram-data'
import { UNSAVED_TEXT, UNSAVED_TITLE } from '../../../../shared/unsaved.js'

// 다이어그램 목록(main-navigator.vue)이 하는 일. DOM 없이 도는 테스트라서 .vue를 불러올 수 없다: <script>의 내용을 꺼내
// import만 바꿔서 돌리고, methods, computed, watch를 가짜 this로 부른다 (terminal-panel-methods.test.js와 같은 방법).
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'main-navigator.vue'), 'utf8').replace(/\r\n/g, '\n')
const script = source.match(/<script>\n([\s\S]*?)<\/script>/)[1]
const imported = [...script.matchAll(/^import (?:\{ ([^}]+) \}|(\w+)) from .*$/gm)].flatMap(match => (match[1] ?? match[2]).split(', '))
const toasts = []
const given = {
  isEmpty,
  hasSavedPassword,
  listEmptyText,
  matchesKeyword,
  EXPORT_PASSWORD_WARNING,
  countByOwner,
  sessionsOf,
  closeTerminalsQuestion,
  terminalCountText,
  copyNavigatorItem,
  createNavigatorItem,
  emptyItemData,
  removeNavigatorItems,
  toProjectItems,
  SWITCHER_MENU_POPPER,
  diagramProblem,
  UNSAVED_TEXT,
  UNSAVED_TITLE,
  toastError: (vm, title, error) => toasts.push([title, String(error?.message ?? error)])
}
const body = script.replace(/^import .*\n/gm, '').replace('export default', 'return')
const component = runInThisContext(`(function (${imported.join(', ')}) {\n${body}\n})`)(...imported.map(name => given[name]))

const diagram = (name, more = {}) => ({ name, data: { id: 'test@0.1.0', nodes: {} }, ...more })
const withPassword = diagram('secret', { data: { id: 'test@0.1.0', nodes: { 1: { data: { connection: { password: 'pw' } } } } } })

// 가짜 this: 목록을 가진 다이어그램 목록. confirm은 확인 창(msgBoxConfirm)의 답을 차례로 준다.
function navigator(projectData = [diagram('alpha'), diagram('beta'), diagram('gamma')], { isLocked = true, answers = [] } = {}) {
  const emitted = []
  const asked = []
  const vm = {
    projectData,
    isLocked,
    $emit: (...args) => emitted.push(args),
    $set: (target, key, value) => { target[key] = value },
    $nextTick: () => {},
    $store: { getters: { allTerminalSessions: [] } },
    $bvModal: { msgBoxConfirm: async (message, options) => { asked.push([message, options]); return answers.shift() } }
  }
  for (const [name, method] of Object.entries(component.methods)) vm[name] = method.bind(vm)
  Object.assign(vm, component.data.call(vm))
  for (const [name, get] of Object.entries(component.computed)) Object.defineProperty(vm, name, { get: () => get.call(vm) })
  component.created.call(vm)
  // 목록을 통째로 바꾸면 watch가 부모에 알린다 (Vue가 하는 일을 흉내 낸다)
  let items = vm.items
  Object.defineProperty(vm, 'items', { get: () => items, set: value => { items = value; component.watch.items.call(vm) } })
  return { vm, emitted, asked }
}
const click = { type: 'click' }
const names = vm => vm.items.map(x => x.name)

afterEach(() => {
  vi.unstubAllGlobals()
  toasts.length = 0
})

describe('the script of the diagram list', () => {
  it('runs here without Vue', () => {
    expect(component.name).toBe('MainNavigator')
    expect(imported).toContain('removeNavigatorItems')
    expect(imported.filter(name => !(name in given)).sort()).toEqual(['NavigatorItemMenu', 'draggable'])
  })

  it('makes its rows from the saved diagrams, each with its own number', () => {
    const { vm } = navigator()
    expect(vm.items.map(x => [x.name, x.index, x.isSelected, x.isEditing])).toEqual([['alpha', 0, false, false], ['beta', 1, false, false], ['gamma', 2, false, false]])
    expect(vm.itemIndex).toBe(3)
    expect(vm.openedItemIndex).toBe(null)
  })
})

describe('opening a diagram', () => {
  it('opens the clicked one and tells the parent which, locked', async () => {
    const { vm, emitted, asked } = navigator()

    await vm.openItem(vm.items[1], click)
    expect(vm.openedItem).toBe(vm.items[1])
    expect(emitted).toEqual([['selected', { item: vm.items[1], index: 1, isLocked: true }]])
    expect(asked).toEqual([])
  })

  it('asks first while the editor is unlocked, and stays when the answer is no', async () => {
    const { vm, emitted, asked } = navigator(undefined, { isLocked: false, answers: [false, true] })
    vm.openedItem = vm.items[0]

    await vm.openItem(vm.items[1], click)
    expect(asked[0][0]).toBe(`${UNSAVED_TEXT} Continue?`)
    expect(asked[0][1]).toMatchObject({ title: UNSAVED_TITLE, okTitle: 'Continue' })
    expect(vm.openedItem).toBe(vm.items[0])
    expect(emitted).toEqual([])

    await vm.openItem(vm.items[1], click)
    expect(vm.openedItem).toBe(vm.items[1])
    expect(emitted).toHaveLength(1)
  })

  // 손으로 만든 파일의 다이어그램: 에디터의 id가 없다. Rete는 이런 데이터를 거절하고 캔버스를 그대로 둔다 (utils/diagram-data.js)
  it('does not open a diagram whose data the editor cannot read, and says why', async () => {
    const { vm, emitted, asked } = navigator([diagram('alpha'), diagram('broken', { data: { nodes: {} } }), diagram('', { data: { id: 'test@0.1.0', nodes: { 7: null } } })])
    await vm.openItem(vm.items[0], click)

    await vm.openItem(vm.items[1], click)
    expect(vm.openedItem).toBe(vm.items[0])
    expect(vm.openedItemIndex).toBe(0)
    expect(emitted).toEqual([['selected', { item: vm.items[0], index: 0, isLocked: true }]])
    expect(toasts).toEqual([['Cannot open "broken"', 'Its data is not in the format of this app.\nNothing was changed.']])
    expect(asked).toEqual([])
    // 데이터는 그대로다
    expect(vm.items[1].data).toEqual({ nodes: {} })

    await vm.openItem(vm.items[2], click)
    expect(vm.openedItem).toBe(vm.items[0])
    expect(toasts[1]).toEqual(['Cannot open "(untitled)"', 'Node 7 cannot be read.\nNothing was changed.'])
    expect(emitted).toHaveLength(1)
  })

  it('does not ask about unsaved changes for a diagram it will not open', async () => {
    const { vm, emitted, asked } = navigator([diagram('alpha'), diagram('broken', { data: { nodes: {} } })], { isLocked: false, answers: [true] })
    vm.openedItem = vm.items[0]

    await vm.openItem(vm.items[1], click)
    expect(asked).toEqual([])
    expect(vm.openedItem).toBe(vm.items[0])
    expect(emitted).toEqual([])
    expect(toasts).toHaveLength(1)
  })

  it('opens nothing when no diagram was open and the clicked one cannot be read', async () => {
    const { vm, emitted } = navigator([diagram('broken', { data: { id: 'other@1.0.0', nodes: {} } })])

    await vm.openItem(vm.items[0], click)
    expect(vm.openedItem).toBe(null)
    expect(vm.openedItemIndex).toBe(null)
    expect(emitted).toEqual([])
    expect(toasts).toHaveLength(1)
  })

  it('does not ask when the app itself opens one (a new diagram)', async () => {
    const { vm, asked } = navigator(undefined, { isLocked: false })
    await vm.openItem(vm.items[2])
    expect(asked).toEqual([])
    expect(vm.openedItem).toBe(vm.items[2])
  })

  it('only closes the list when the open diagram is clicked again', async () => {
    const { vm, emitted, asked } = navigator(undefined, { isLocked: false })
    vm.openedItem = vm.items[0]

    await vm.openItem(vm.items[0], click)
    expect(emitted).toEqual([['hide']])
    expect(asked).toEqual([])
  })

  it('selects with Ctrl+click instead of opening, and a plain click drops the selection', async () => {
    const { vm, emitted } = navigator()

    await vm.openItem(vm.items[0], { ctrlKey: true })
    await vm.openItem(vm.items[2], { ctrlKey: true })
    expect(vm.selectedItems).toEqual([vm.items[0], vm.items[2]])
    expect(vm.isSelecting).toBe(true)
    expect(vm.openedItem).toBe(null)
    expect(emitted).toEqual([])
    await vm.openItem(vm.items[2], { ctrlKey: true })
    expect(vm.selectedItems).toEqual([vm.items[0]])

    await vm.openItem(vm.items[1], click)
    expect(vm.isSelecting).toBe(false)
  })

  it('drops the selection when the search text changes or a click lands outside', () => {
    const { vm } = navigator()
    vm.items[0].isSelected = true
    component.watch.keyword.call(vm)
    expect(vm.isSelecting).toBe(false)

    vm.items[1].isSelected = true
    vm.vcoConfig.isActive = true
    vm.onClickOutside()
    expect(vm.isSelecting).toBe(false)
    expect(vm.vcoConfig.isActive).toBe(false)
  })
})

describe('adding, copying and renaming', () => {
  it('adds an empty diagram on top, opens it with its name box, and clears the search that would hide it', async () => {
    const { vm, emitted } = navigator()
    vm.keyword = 'alp'

    await vm.addNewItem()
    expect(vm.keyword).toBe('')
    expect(names(vm)).toEqual(['', 'alpha', 'beta', 'gamma'])
    expect(vm.items[0]).toMatchObject({ index: 3, isEditing: true, data: emptyItemData() })
    expect(vm.openedItem).toBe(vm.items[0])
    expect(emitted.at(-1)).toEqual(['selected', { item: vm.items[0], index: 0, isLocked: false }])
  })

  it('adds nothing when unlocked changes would be lost and the answer is no', async () => {
    const { vm, emitted } = navigator(undefined, { isLocked: false, answers: [false] })
    vm.keyword = 'alp'

    await vm.addNewItem()
    expect(names(vm)).toEqual(['alpha', 'beta', 'gamma'])
    expect(vm.keyword).toBe('alp')
    expect(emitted).toEqual([])
  })

  it('puts a copy right after its original, as its own diagram', () => {
    const { vm } = navigator([diagram('alpha'), diagram('beta', { view: { x: 1, y: 2, k: 1 } })])
    vm.keyword = 'bet'

    vm.copyItem(vm.items[1])
    vm.copyItem(vm.items[0])
    expect(vm.keyword).toBe('')
    expect(names(vm)).toEqual(['alpha', 'alpha', 'beta', 'beta'])
    expect(vm.items[3]).toMatchObject({ index: 2, isEditing: true, view: { x: 1, y: 2, k: 1 } })
    expect(vm.items[3].data).not.toBe(vm.items[2].data)
    expect(vm.items[3].view).not.toBe(vm.items[2].view)
  })

  it('copies nothing of a row that is not in the list', () => {
    const { vm } = navigator()
    vm.copyItem(createNavigatorItem(diagram('stray'), 99))
    expect(names(vm)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('puts the old name back into the box when a rename is cancelled', () => {
    const { vm } = navigator()
    const item = vm.items[0]
    item.isEditing = true
    const event = { target: { value: 'half typed' } }

    vm.cancelEdit(item, event)
    expect(event.target.value).toBe('alpha')
    expect(item.isEditing).toBe(false)
    expect(item.name).toBe('alpha')
  })

  it('finds rows by the search text', () => {
    const { vm } = navigator()
    vm.keyword = ' ALP '
    expect(vm.items.map(x => vm.matches(x))).toEqual([true, false, false])
    expect(vm.emptyText).toBe(listEmptyText(vm.items, ' ALP '))
  })
})

describe('removing', () => {
  it('asks with the name, and removes nothing when the answer is no', async () => {
    const { vm, emitted, asked } = navigator([diagram('alpha'), diagram('')], { answers: [false, false] })

    await vm.removeItem(vm.items[0])
    await vm.removeItem(vm.items[1])
    expect(asked.map(x => x[0])).toEqual(['Remove "alpha"?', 'Remove "(untitled)"?'])
    expect(asked[0][1]).toMatchObject({ title: 'Remove', okVariant: 'danger', okTitle: 'Remove' })
    expect(names(vm)).toEqual(['alpha', ''])
    expect(emitted).toEqual([])
  })

  it('removes the row, tells the parent its number for the terminals, and saves', async () => {
    const { vm, emitted } = navigator(undefined, { answers: [true] })
    vm.openedItem = vm.items[0]

    await vm.removeItem(vm.items[1])
    expect(names(vm)).toEqual(['alpha', 'gamma'])
    expect(emitted).toEqual([['removed', [1]], ['updated', { items: toProjectItems(vm.items), index: 0 }]])
    expect(vm.openedItem).toBe(vm.items[0])
  })

  it('closes the editor when the open diagram is removed', async () => {
    const { vm, emitted } = navigator(undefined, { answers: [true] })
    vm.openedItem = vm.items[1]

    await vm.removeItem(vm.items[1])
    expect(vm.openedItem).toBe(null)
    expect(emitted.map(x => x[0])).toEqual(['deselected', 'removed', 'updated'])
    expect(emitted.at(-1)[1].index).toBe(null)
  })

  it('removes the selected ones together after one question', async () => {
    const { vm, emitted, asked } = navigator(undefined, { answers: [true] })
    vm.items[0].isSelected = true
    vm.items[2].isSelected = true

    await vm.removeSelectedItems()
    expect(asked.map(x => x[0])).toEqual(['Remove 2 selected space(s)?'])
    expect(names(vm)).toEqual(['beta'])
    expect(emitted[0]).toEqual(['removed', [0, 2]])
  })
})

describe('closing the terminals of a diagram', () => {
  const tabs = [{ owner: 1, status: 'running' }, { owner: 1, status: 'exited' }, { owner: 0, status: 'running' }, { owner: 2, status: 'exited' }]

  it('asks while one of its tabs still runs, with the numbers of that row only, and closes nothing on no', async () => {
    const { vm, emitted, asked } = navigator(undefined, { answers: [false] })
    vm.$store.getters.allTerminalSessions = tabs

    await vm.closeTerminals(vm.items[1])
    expect(asked).toEqual([['Close all 2 terminals of "beta"? 1 of them is still running.', { title: 'Close terminals', okVariant: 'danger', okTitle: 'Close terminals' }]])
    expect(emitted).toEqual([])
  })

  it('tells the parent the number of the row on yes, and leaves the list and the open diagram as they are', async () => {
    const { vm, emitted } = navigator(undefined, { answers: [true] })
    vm.$store.getters.allTerminalSessions = tabs
    vm.openedItem = vm.items[1]

    await vm.closeTerminals(vm.items[1])
    expect(emitted).toEqual([['close-terminals', [1]]])
    expect(names(vm)).toEqual(['alpha', 'beta', 'gamma'])
    expect(vm.openedItem).toBe(vm.items[1])
  })

  it('closes at once when every tab of the row has ended', async () => {
    const { vm, emitted, asked } = navigator()
    vm.$store.getters.allTerminalSessions = tabs

    await vm.closeTerminals(vm.items[2])
    expect(asked).toEqual([])
    expect(emitted).toEqual([['close-terminals', [2]]])
  })

  it('is in the menu of a row that has tabs, and the panel closes them', () => {
    const menu = readFileSync(join(here, 'navigator-item-menu.vue'), 'utf8').replace(/\r\n/g, '\n')
    const layout = readFileSync(join(here, '../../views/Layout.vue'), 'utf8').replace(/\r\n/g, '\n')
    const row = source.match(/<NavigatorItemMenu\n([\s\S]*?)\/>/)[1]

    expect(row).toContain(':terminals="terminalCounts.get(item.index) || 0"')
    expect(row).toContain('@close-terminals="item.isMenuShown = false; closeTerminals(item)"')
    // 맨 끝, 터미널이 있을 때만
    expect(menu).toMatch(/<template v-if="terminals > 0">\s*<b-dropdown-divider \/>\s*<b-dropdown-item @click="\$emit\('close-terminals'\)">\s*<small>Close terminals<\/small>\s*<\/b-dropdown-item>\s*<\/template>\s*<\/b-dropdown>/)
    expect(layout).toContain('@close-terminals="$refs.terminalPanel.closeOwners($event)"')
  })
})

describe('exporting and importing', () => {
  const files = ({ imported = null, fail = false } = {}) => {
    const calls = []
    vi.stubGlobal('window', {
      preload: {
        exportProjects: async (...args) => { calls.push(['export', ...args]); if (fail) throw new Error('disk full') },
        importProjects: async () => { calls.push(['import']); if (fail) throw new Error('not a file'); return imported }
      }
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    return calls
  }
  afterEach(() => vi.restoreAllMocks())

  it('exports the rows as saved diagrams, without what only the list knows', async () => {
    const calls = files()
    const { vm, asked } = navigator([diagram('alpha', { view: { x: 1, y: 2, k: 1 } }), diagram('beta')])
    vm.items[0].isSelected = true

    await vm.exportSelectedItems()
    expect(asked).toEqual([])
    expect(calls).toEqual([['export', JSON.stringify([{ name: 'alpha', data: { id: 'test@0.1.0', nodes: {} }, view: { x: 1, y: 2, k: 1 } }]), 'export.json']])
  })

  it('warns before a saved password goes into the file, and exports only on yes', async () => {
    const calls = files()
    const { vm, asked } = navigator([withPassword], { answers: [false, true] })

    await vm.exportItems(vm.items)
    expect(asked[0]).toEqual([EXPORT_PASSWORD_WARNING, { title: 'Export', okTitle: 'Export' }])
    expect(calls).toEqual([])

    await vm.exportItems(vm.items)
    expect(calls).toHaveLength(1)
  })

  it('says so when the export fails', async () => {
    files({ fail: true })
    const { vm } = navigator()

    await vm.exportItems(vm.items)
    expect(toasts).toEqual([['Failed to export', 'disk full']])
  })

  it('adds the diagrams of the file after the ones that are there, with new numbers, and saves', async () => {
    files({ imported: JSON.stringify([diagram('one'), diagram('two')]) })
    const { vm, emitted } = navigator()

    await vm.importItems()
    expect(names(vm)).toEqual(['alpha', 'beta', 'gamma', 'one', 'two'])
    expect(vm.items.map(x => x.index)).toEqual([0, 1, 2, 3, 4])
    expect(emitted).toEqual([['updated', { items: toProjectItems(vm.items), index: null }]])
  })

  it('changes nothing when the file dialog is cancelled, or when unlocked changes would be lost and the answer is no', async () => {
    const calls = files({ imported: null })
    const locked = navigator()
    await locked.vm.importItems()
    expect(names(locked.vm)).toEqual(['alpha', 'beta', 'gamma'])
    expect(locked.emitted).toEqual([])

    const unlocked = navigator(undefined, { isLocked: false, answers: [false] })
    await unlocked.vm.importItems()
    expect(calls).toEqual([['import']])
    expect(unlocked.asked).toHaveLength(1)
  })

  it('says so when the file cannot be read or is not a list of diagrams', async () => {
    files({ fail: true })
    const first = navigator()
    await first.vm.importItems()
    expect(toasts).toEqual([['Failed to import', 'not a file']])

    toasts.length = 0
    files({ imported: '{ broken' })
    const second = navigator()
    await second.vm.importItems()
    expect(toasts).toHaveLength(1)
    expect(toasts[0][0]).toBe('Failed to import')
    expect(names(second.vm)).toEqual(['alpha', 'beta', 'gamma'])
  })
})

describe('what the editor tells the list', () => {
  it('keeps the changed diagram and the view of the canvas with their row', () => {
    const { vm } = navigator()
    const data = { id: 'test@0.1.0', nodes: { 1: {} } }

    vm.updateItemEditorData({ data, index: 1 })
    vm.updateItemView({ view: { x: 5, y: 6, k: 2 }, index: 1 })
    expect(vm.items[1].data).toBe(data)
    expect(vm.items[1].view).toEqual({ x: 5, y: 6, k: 2 })
    expect(toProjectItems(vm.items)[1]).toEqual({ name: 'beta', data, view: { x: 5, y: 6, k: 2 } })
  })

  it('ignores a row that is gone', () => {
    const { vm } = navigator()
    expect(() => vm.updateItemEditorData({ data: {}, index: 9 })).not.toThrow()
    expect(() => vm.updateItemView({ view: {}, index: 9 })).not.toThrow()
    expect(vm.items).toHaveLength(3)
  })

  it('tells the parent the list and which row is open', () => {
    const { vm, emitted } = navigator()
    vm.openedItem = vm.items[2]

    vm.emitUpdated()
    expect(emitted).toEqual([['updated', { items: toProjectItems(vm.items), index: 2 }]])
  })

  it('counts the terminal tabs of each row', () => {
    const { vm } = navigator()
    vm.$store.getters.allTerminalSessions = [{ owner: 0 }, { owner: 2 }, { owner: 2 }]
    expect(vm.terminalCounts).toEqual(countByOwner(vm.$store.getters.allTerminalSessions))
  })
})
