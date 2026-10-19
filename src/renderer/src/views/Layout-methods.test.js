import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canvasHint, hasSavedPassword, loadProjectData, losesChangesOnUnload, EXPORT_PASSWORD_WARNING } from '../utils/project'
import { DEFAULT_VIEW, sanitizeView } from '../utils/view'

// 화면 전체(Layout.vue)가 하는 일: 무엇을 언제 저장하는가. DOM 없이 도는 테스트라서 .vue를 불러올 수 없다:
// <script>의 내용을 꺼내 import만 바꿔서 돌리고, methods, computed, watch를 가짜 this로 부른다
// (main-navigator-methods.test.js와 같은 방법).
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'Layout.vue'), 'utf8').replace(/\r\n/g, '\n')
const script = source.match(/<script>\n([\s\S]*?)<\/script>/)[1]
const imported = [...script.matchAll(/^import (?:\{ ([^}]+) \}|(\w+)) from .*$/gm)].flatMap(match => (match[1] ?? match[2]).split(', '))
const toasts = []
const given = {
  canvasHint,
  hasSavedPassword,
  loadProjectData,
  losesChangesOnUnload,
  EXPORT_PASSWORD_WARNING,
  DEFAULT_VIEW,
  sanitizeView,
  // 세 번째 칸: 토스트에 더한 옵션 (없으면 칸도 없다)
  toastError: (vm, title, error, options) => toasts.push([title, String(error?.message ?? error), ...(options ? [options] : [])])
}
const body = script.replace(/^import .*\n/gm, '').replace('export default', 'return')
// 자식 컴포넌트는 여기서 쓰이지 않는다: 이름만 채운다
const component = runInThisContext(`(function (${imported.join(', ')}) {\n${body}\n})`)(...imported.map(name => given[name] ?? { name }))

const diagram = (name, more = {}) => ({ name, data: { id: 'test@0.1.0', nodes: {} }, ...more })
const withPassword = diagram('secret', { data: { id: 'test@0.1.0', nodes: { 1: { data: { connection: { password: 'pw' } } } } } })

// 가짜 preload: 저장은 부른 순서대로 기록하고, 테스트가 끝내 준다
function preload({ stored = null } = {}) {
  const api = {
    saved: [],
    pending: [],
    exported: [],
    titles: [],
    setWindowTitle: name => api.titles.push(name),
    loadProjects: async () => stored,
    saveProjects: json => new Promise((resolve, reject) => { api.saved.push(json); api.pending.push({ resolve, reject }) }),
    exportProjects: async (json, name) => { api.exported.push([json, name]) }
  }
  return api
}

// 가짜 this: data()와 created()를 거친 화면. 에디터와 목록은 부른 것을 적어 둔다.
function layout({ projectData = [diagram('alpha'), diagram('beta')], answers = [], api = preload() } = {}) {
  vi.stubGlobal('window', { preload: api, localStorage: {}, addEventListener() {}, removeEventListener() {} })
  const calls = []
  const controls = [{ saved: 0 }, { saved: 0 }]
  const vm = {
    ...component.data(),
    projectData,
    calls,
    controls,
    api,
    $store: {
      getters: { setting: { backdrop: 'vivid', hideNodeInfo: false, nodeBlur: 4 }, isTerminalPanelMaximized: false },
      commit: (name, value) => calls.push(['commit', name, value]),
      dispatch: (name, value) => calls.push(['dispatch', name, value])
    },
    $refs: {
      editorRef: {
        editor: {
          trigger: (name, value) => calls.push(['trigger', name, value]),
          nodes: controls.map(control => ({ controls: new Map([['connection', { save: () => { control.saved += 1 } }]]) }))
        },
        openView: view => calls.push(['openView', view, vm.isRestoringView]),
        resetView: () => calls.push(['resetView']),
        arrangeNodes: () => calls.push(['arrangeNodes']),
        addFromConfig: (plan, point) => calls.push(['addFromConfig', plan, point]),
        nodeKeys: () => ['ops@10.0.0.1:22', '@10.0.0.2:22'],
        compile: async () => ({ id: 'test@0.1.0', nodes: { 7: {} } })
      },
      mainNavigator: {
        focusSearch: () => calls.push(['focusSearch']),
        updateItemView: value => calls.push(['updateItemView', value]),
        updateItemEditorData: value => calls.push(['updateItemEditorData', value])
      }
    },
    $bvModal: { msgBoxConfirm: async (...args) => { calls.push(['confirm', ...args]); return answers.shift() } },
    $nextTick: fn => fn()
  }
  for (const [name, method] of Object.entries(component.methods)) vm[name] = method.bind(vm)
  for (const [name, getter] of Object.entries(component.computed)) Object.defineProperty(vm, name, { get: getter.bind(vm), enumerable: true })
  component.created.call(vm)
  return vm
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

beforeEach(() => {
  vi.useFakeTimers()
  toasts.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('what is saved, and when', () => {
  it('a change of the diagram list is taken over and saved at once', () => {
    const vm = layout()
    const items = [diagram('alpha'), diagram('new')]
    vm.updateProject({ items, index: 1 })

    expect(vm.projectData).toEqual(items)
    expect(vm.projectData).not.toBe(items)
    expect(vm.openedItemIndex).toBe(1)
    expect(vm.api.saved).toEqual([JSON.stringify(items)])
  })

  it('the saving mark counts saves that have not ended, also overlapping ones', async () => {
    const vm = layout()
    vm.saveProject()
    vm.saveProject()
    expect(vm.savingCount).toBe(2)

    vm.api.pending[0].resolve()
    await flush()
    expect(vm.savingCount).toBe(1)
    vm.api.pending[1].resolve()
    await flush()
    expect(vm.savingCount).toBe(0)
    expect(toasts).toEqual([])
  })

  it('a save that fails is reported and no longer counted', async () => {
    const vm = layout()
    vm.saveProject()
    vm.api.pending[0].reject(new Error('disk full'))
    await flush()

    expect(vm.savingCount).toBe(0)
    expect(toasts).toEqual([['Failed to save spaces', 'disk full']])
  })

  it('after a failed load nothing is saved, so the file is not overwritten with an empty list', async () => {
    const api = preload()
    api.loadProjects = async () => { throw new Error('unreadable') }
    const vm = layout({ projectData: null, api })
    await vm.loadProject()

    expect(vm.isProjectLoadFailed).toBe(true)
    expect(vm.projectData).toEqual([])
    // 닫을 때까지 남는 알림이다
    expect(toasts).toEqual([['Failed to load spaces. Changes will not be saved.', 'unreadable', { noAutoHide: true }]])

    vm.updateProject({ items: [diagram('typed meanwhile')], index: null })
    await vm.saveProject()
    expect(api.saved).toEqual([])
    expect(vm.savingCount).toBe(0)
  })

  // main이 config.json을 열지 못하고 기본 설정으로 시작했다 (main의 openStore)
  it('says that the settings could not be read, in a message that stays', async () => {
    const api = preload()
    api.getSettingProblem = async () => 'config.json could not be opened (EISDIR).\nThe folder:\nD:\\data'
    const vm = layout({ api })
    await vm.noteSettingProblem()

    expect(toasts).toEqual([['Failed to load the settings. Changes will not be saved.', 'config.json could not be opened (EISDIR).\nThe folder:\nD:\\data', { noAutoHide: true }]])
    // 다이어그램의 저장은 막지 않는다: 다른 파일이다
    expect(vm.isProjectLoadFailed).toBe(false)
  })

  it('says nothing when main opened the settings, or cannot tell', async () => {
    const api = preload()
    api.getSettingProblem = async () => null
    await layout({ api }).noteSettingProblem()
    api.getSettingProblem = async () => { throw new Error('no answer') }
    await layout({ api }).noteSettingProblem()

    expect(toasts).toEqual([])
  })

  it('asks for it when the page is there, with the diagrams', async () => {
    const api = preload({ stored: JSON.stringify([diagram('kept')]) })
    api.getSettingProblem = async () => 'config.json could not be opened (EPERM).'
    const vm = layout({ projectData: null, api })
    component.mounted.call(vm)
    await flush()

    expect(toasts.map(toast => toast[0])).toEqual(['Failed to load the settings. Changes will not be saved.'])
    expect(vm.projectData.map(item => item.name)).toEqual(['kept'])
  })

  it('a load shows the stored diagrams and opens the list with the keyboard in its search', async () => {
    const stored = JSON.stringify([diagram('kept')])
    const vm = layout({ projectData: null, api: preload({ stored }) })
    await vm.loadProject()

    expect(vm.projectData.map(item => item.name)).toEqual(['kept'])
    expect(vm.isProjectLoadFailed).toBe(false)
    expect(vm.isSwitcherOpen).toBe(true)
    expect(vm.calls).toContainEqual(['focusSearch'])
    expect(vm.api.saved).toEqual([])
  })
})

describe('locking', () => {
  it('locking: the editor is told, the nodes hand in their fields, the diagram is compiled into the list, then saved', async () => {
    const vm = layout()
    vm.openedItemIndex = 1
    vm.isEditorLocked = true
    await component.watch.isEditorLocked.call(vm)

    expect(vm.calls[0]).toEqual(['trigger', 'readonly', true])
    expect(vm.controls.map(control => control.saved)).toEqual([1, 1])
    expect(vm.projectData[1].data).toEqual({ id: 'test@0.1.0', nodes: { 7: {} } })
    expect(vm.projectData[0].data.nodes).toEqual({})
    expect(vm.calls).toContainEqual(['updateItemEditorData', { data: vm.projectData[1].data, index: 1 }])
    expect(vm.api.saved).toHaveLength(1)
    expect(JSON.parse(vm.api.saved[0])[1].data.nodes).toEqual({ 7: {} })
  })

  it('unlocking: the editor is told, and nothing is compiled or saved', async () => {
    const vm = layout()
    vm.openedItemIndex = 0
    vm.isEditorLocked = false
    await component.watch.isEditorLocked.call(vm)

    expect(vm.calls).toEqual([['trigger', 'readonly', false]])
    expect(vm.controls.map(control => control.saved)).toEqual([0, 0])
    expect(vm.api.saved).toEqual([])
  })

  it('compiling with no diagram open touches nothing, and an index without an item is left alone', async () => {
    const vm = layout()
    await vm.compileEditor()
    expect(vm.controls.map(control => control.saved)).toEqual([0, 0])

    vm.openedItemIndex = 5
    await vm.compileEditor()
    expect(vm.calls.filter(call => call[0] === 'updateItemEditorData')).toEqual([])
    expect(vm.projectData.map(item => item.data.nodes)).toEqual([{}, {}])
  })
})

describe('the view of the canvas', () => {
  it('a moved canvas is remembered on the open diagram and saved 0.4 s after the last move', () => {
    const vm = layout()
    vm.openedItemIndex = 0
    vm.updateView({ k: 1, x: 10, y: 0 })
    vi.advanceTimersByTime(300)
    vm.updateView({ k: 1, x: 20, y: 0 })

    expect(vm.projectData[0].view).toEqual({ k: 1, x: 20, y: 0 })
    expect(vm.calls.filter(call => call[0] === 'updateItemView')).toHaveLength(2)
    vi.advanceTimersByTime(399)
    expect(vm.api.saved).toEqual([])
    vi.advanceTimersByTime(1)
    expect(vm.api.saved).toHaveLength(1)
    expect(JSON.parse(vm.api.saved[0])[0].view).toEqual({ k: 1, x: 20, y: 0 })
  })

  it('a move while a view is being restored, or with nothing open, is not remembered and not saved', () => {
    const vm = layout()
    vm.updateView({ k: 2, x: 1, y: 1 })
    vm.openedItemIndex = 0
    vm.isRestoringView = true
    vm.updateView({ k: 2, x: 1, y: 1 })
    vi.advanceTimersByTime(1000)

    expect(vm.projectData[0].view).toBeUndefined()
    expect(vm.calls).toEqual([])
    expect(vm.api.saved).toEqual([])
  })

  it('the timer of a pending view save is dropped with the page', () => {
    const vm = layout()
    vm.openedItemIndex = 0
    vm.updateView({ k: 1, x: 5, y: 5 })
    component.beforeDestroy.call(vm)
    vi.advanceTimersByTime(1000)

    expect(vm.api.saved).toEqual([])
  })

  it('opening a diagram shows its stored view, or the starting view, and that is no change to save', () => {
    const vm = layout()
    vm.loadEditor({ item: { ...diagram('alpha'), index: 4, view: { k: 0.5, x: 3, y: 4, w: 800, h: 600 } }, index: 0, isLocked: true })
    vm.loadEditor({ item: { ...diagram('beta'), index: 9, view: { k: 'broken' } }, index: 1, isLocked: true })

    const opened = vm.calls.filter(call => call[0] === 'openView')
    expect(opened[0]).toEqual(['openView', { k: 0.5, x: 3, y: 4, w: 800, h: 600 }, true])
    expect(opened[1]).toEqual(['openView', DEFAULT_VIEW, true])
    expect(vm.isRestoringView).toBe(false)
    expect(vm.api.saved).toEqual([])
  })
})

describe('opening and closing a diagram', () => {
  it('opening: the editor gets the data, the terminals of that item are shown, the list closes', () => {
    const vm = layout()
    vm.isSwitcherOpen = true
    vm.loadEditor({ item: { ...diagram('alpha'), index: 4 }, index: 0, isLocked: true })

    expect(JSON.parse(vm.editorData)).toMatchObject({ id: 'test@0.1.0', nodes: {} })
    expect(vm.openedItemIndex).toBe(0)
    expect(vm.isEditorLocked).toBe(true)
    expect(vm.calls).toContainEqual(['commit', 'terminalOwner', 4])
    expect(vm.isSwitcherOpen).toBe(false)
    expect(vm.openedItemName).toBe('alpha')
  })

  it('the same data opened twice is a new value for the editor', () => {
    const vm = layout()
    const item = { ...diagram('alpha'), index: 0 }
    vm.loadEditor({ item, index: 0, isLocked: true })
    const first = vm.editorData
    vi.advanceTimersByTime(5)
    vm.loadEditor({ item, index: 0, isLocked: true })

    expect(vm.editorData).not.toBe(first)
  })

  it('a new diagram opens unlocked and the list stays open for its name', () => {
    const vm = layout()
    vm.isSwitcherOpen = true
    vm.loadEditor({ item: { ...diagram(''), index: 2 }, index: 1, isLocked: false })

    expect(vm.isEditorLocked).toBe(false)
    expect(vm.isSwitcherOpen).toBe(true)
  })

  it('closing: no data, no index, locked, and no terminals of an item shown', () => {
    const vm = layout()
    vm.loadEditor({ item: { ...diagram('alpha'), index: 4 }, index: 0, isLocked: false })
    vm.clearEditor()

    expect([vm.editorData, vm.openedItemIndex, vm.isEditorLocked]).toEqual([null, null, true])
    expect(vm.calls.at(-1)).toEqual(['commit', 'terminalOwner', null])
    expect(vm.openedItemName).toBe('')
  })

  it('the window title follows the name of the open diagram', () => {
    const vm = layout()
    component.watch.openedItemName.call(vm, 'alpha')
    component.watch.openedItemName.call(vm, '')

    expect(vm.api.titles).toEqual(['alpha', ''])
  })
})

describe('leaving the page', () => {
  const leave = vm => {
    const event = { prevented: 0, preventDefault() { this.prevented += 1 } }
    vm.holdUnload(event)
    return event
  }

  it('is held only while a diagram is open and unlocked', () => {
    const vm = layout()
    expect(leave(vm).prevented).toBe(0)

    vm.openedItemIndex = 0
    expect(leave(vm).prevented).toBe(0)

    vm.isEditorLocked = false
    const held = leave(vm)
    expect(held.prevented).toBe(1)
    expect(held.returnValue).toBe(false)

    vm.openedItemIndex = null
    expect(leave(vm).prevented).toBe(0)
  })
})

describe('the header and the canvas menu', () => {
  it('From SSH config: the place of the click is kept for the nodes, and nothing is added while locked or closed', () => {
    const vm = layout()
    vm.openConfigPopup([120, 80])
    expect(vm.isShowConfigPopup).toBe(true)
    // 창은 그때 다이어그램에 있던 노드들을 안다: 이미 있는 노드를 만들려 하면 묻는다
    expect(vm.configExisting).toEqual(['ops@10.0.0.1:22', '@10.0.0.2:22'])

    vm.addFromConfig({ nodes: [] })
    vm.isEditorLocked = false
    vm.addFromConfig({ nodes: [] })
    vm.isEditorLocked = true
    vm.editorData = '{}'
    vm.addFromConfig({ nodes: [] })
    expect(vm.calls).toEqual([])

    vm.isEditorLocked = false
    vm.addFromConfig({ nodes: [] })
    expect(vm.calls).toEqual([['addFromConfig', { nodes: [] }, [120, 80]]])
  })

  it('the eye button turns the setting over and keeps the rest', () => {
    const vm = layout()
    vm.toggleNodeInfo()

    expect(vm.calls).toEqual([['dispatch', 'settingSave', { backdrop: 'vivid', hideNodeInfo: true, nodeBlur: 4 }]])
  })

  it('the title opens the list with the keyboard in the search, and closes it again', () => {
    const focused = []
    vi.stubGlobal('document', { getElementById: id => ({ focus: () => focused.push(id) }) })
    const vm = layout()
    vm.toggleSwitcher()
    expect(vm.isSwitcherOpen).toBe(true)
    expect(vm.calls).toEqual([['focusSearch']])

    vm.toggleSwitcher()
    expect(vm.isSwitcherOpen).toBe(false)
    expect(focused).toEqual([])

    vm.openSwitcher()
    vm.closeSwitcher({ returnFocus: true })
    expect(focused).toEqual(['diagram-switcher-toggle'])
  })

  it('the hint on the canvas: none while closed, one for an empty diagram', () => {
    const vm = layout()
    const closed = vm.emptyHint
    vm.editorData = '{}'
    vm.isEditorLocked = false

    expect(closed).toEqual(canvasHint({ isOpen: false }))
    expect(vm.emptyHint).toEqual(canvasHint({ isOpen: true, nodeCount: 0, isLocked: false }))
    vm.nodeCount = 2
    expect(vm.emptyHint).toBeNull()
  })

  it('export of everything warns first when a password is saved, and does nothing on Cancel', async () => {
    const plain = layout()
    await plain.exportProject()
    expect(plain.calls).toEqual([])
    expect(plain.api.exported).toEqual([[JSON.stringify(plain.projectData), 'jumpspace.json']])

    const refused = layout({ projectData: [withPassword], answers: [false] })
    await refused.exportProject()
    expect(refused.calls[0].slice(0, 2)).toEqual(['confirm', EXPORT_PASSWORD_WARNING])
    expect(refused.api.exported).toEqual([])

    const agreed = layout({ projectData: [withPassword], answers: [true] })
    await agreed.exportProject()
    expect(agreed.api.exported).toHaveLength(1)
  })

  // 질문을 연 톱니 메뉴의 항목은 그때 닫힌 메뉴 안에 숨어서 포커스를 받지 못한다: BootstrapVue가 키보드를 거기로 돌려주려다
  // 못 해서 키보드가 아무 데도 없었다 (#286). 그 질문이 닫히면 키보드는 톱니 단추로 간다 (BootstrapVue가 닫힐 때 찾는 선택자).
  it('the warning gives the keyboard back to the gear of the header when it closes', async () => {
    const vm = layout({ projectData: [withPassword], answers: [false] })
    await vm.exportProject()
    expect(vm.calls).toEqual([['confirm', EXPORT_PASSWORD_WARNING, { title: 'Export', okTitle: 'Export', returnFocus: '#main-header [aria-label="Menu"]' }]])

    // 그 선택자가 찾는 것: 머리글의 id와 톱니 단추의 이름 (main-header.vue)
    const header = readFileSync(join(here, '../components/layout/main-header.vue'), 'utf8').replace(/\r\n/g, '\n')
    expect(header).toMatch(/^<template>\n\s*<div\n\s*id="main-header"/)
    expect(header).toContain(":toggle-attrs=\"{ 'aria-label': 'Menu' }\"")
  })

  it('an export that fails is reported', async () => {
    const api = preload()
    api.exportProjects = async () => { throw new Error('no such folder') }
    const vm = layout({ api })
    await vm.exportProject()

    expect(toasts).toEqual([['Failed to export', 'no such folder']])
  })
})
