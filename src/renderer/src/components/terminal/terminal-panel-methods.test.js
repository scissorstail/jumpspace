import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextFontSize, searchSeed } from '../../utils/terminal-view'

// 터미널 패널의 찾기와 글꼴 크기. DOM 없이 도는 테스트라서 .vue를 불러올 수 없다: <script>의 내용을 꺼내 import만 바꿔서
// 돌리고, methods와 watch를 가짜 this로 부른다 (forward-menu.test.js와 같은 방법). xterm.js와 그 애드온은 쓰이지 않는다.
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'terminal-panel.vue'), 'utf8').replace(/\r\n/g, '\n')
const script = source.match(/<script>\n([\s\S]*?)<\/script>/)[1]
const imported = [...script.matchAll(/^import (?:\{ ([^}]+) \}|(\w+)) from .*$/gm)].flatMap(match => (match[1] ?? match[2]).split(', '))
const given = { nextFontSize, searchSeed, mapGetters: () => ({}) }
const body = script.replace(/^import .*\n/gm, '').replace('export default', 'return')
const component = runInThisContext(`(function (${imported.join(', ')}) {\n${body}\n})`)(...imported.map(name => given[name]))

// 가짜 터미널: 고른 글, 찾기 애드온이 부른 것, 포커스
function terminal({ selection = '', found = true, shown = true, cols = 80, rows = 24 } = {}) {
  const calls = []
  const term = {
    cols,
    rows,
    options: { fontSize: 13 },
    element: { offsetParent: shown ? {} : null },
    getSelection: () => selection,
    clearSelection: () => calls.push('clearSelection'),
    focus: () => calls.push('focus')
  }
  const search = {
    findNext: text => { calls.push(['findNext', text]); return found },
    findPrevious: text => { calls.push(['findPrevious', text]); return found }
  }
  return { term, search, fit: { fit: () => calls.push('fit') }, id: 7, calls }
}

// 가짜 this: 패널의 data와, 고른 탭의 터미널 하나
function panel(entry, { text = '', fontSize = 13 } = {}) {
  const dispatched = []
  const focused = []
  const vm = {
    activeKey: 1,
    panes: { left: 1, right: null },
    fontSize,
    terms: new Map(entry ? [[1, entry]] : []),
    search: { isOpen: false, text, isMissing: false },
    $refs: { search: { focus: () => focused.push('search') } },
    $nextTick: fn => fn(),
    $store: { dispatch: (...args) => dispatched.push(args) }
  }
  for (const [name, method] of Object.entries(component.methods)) vm[name] = method.bind(vm)
  return { vm, dispatched, focused }
}

afterEach(() => vi.unstubAllGlobals())

describe('the script of the terminal panel', () => {
  it('runs here without xterm.js', () => {
    expect(component.name).toBe('TerminalPanel')
    expect(imported).toContain('SearchAddon')
    expect(imported.length).toBeGreaterThan(15)
  })
})

describe('finding in the terminal of the selected tab', () => {
  it('starts from the newest output while typing: the selection goes first, then upwards', () => {
    const entry = terminal()
    const { vm } = panel(entry, { text: 'needle' })

    vm.find('first')
    expect(entry.calls).toEqual(['clearSelection', ['findPrevious', 'needle']])
    expect(vm.search.isMissing).toBe(false)
  })

  it('goes up with previous and down with next, from the match', () => {
    const entry = terminal()
    const { vm } = panel(entry, { text: 'needle' })

    vm.find('previous')
    vm.find('next')
    expect(entry.calls).toEqual([['findPrevious', 'needle'], ['findNext', 'needle']])
  })

  it('says so when the text is not there, and takes it back when it is found again', () => {
    const entry = terminal({ found: false })
    const { vm } = panel(entry, { text: 'zzz' })

    vm.find('first')
    expect(vm.search.isMissing).toBe(true)

    entry.search.findPrevious = () => true
    vm.find('previous')
    expect(vm.search.isMissing).toBe(false)
  })

  it('asks nothing of the terminal for an empty text, and does not complain', () => {
    const entry = terminal({ found: false })
    const { vm } = panel(entry, { text: '' })
    vm.search.isMissing = true

    vm.find('first')
    expect(entry.calls).toEqual(['clearSelection'])
    expect(vm.search.isMissing).toBe(false)
  })

  it('does nothing without a terminal', () => {
    const { vm } = panel(null, { text: 'needle' })
    expect(() => vm.find('first')).not.toThrow()
    expect(vm.search.isMissing).toBe(false)
  })
})

describe('opening and closing the search field', () => {
  it('opens with the text of before and the keyboard in the field', () => {
    const entry = terminal()
    const { vm, focused } = panel(entry, { text: 'before' })

    vm.openSearch()
    expect(vm.search).toEqual({ isOpen: true, text: 'before', isMissing: false })
    expect(focused).toEqual(['search'])
    expect(entry.calls).toEqual([])
  })

  // 고른 자리를 찾은 것으로 해 둔다: 다음 Enter가 거기서 넘어간다
  it('takes a selection inside one line as the text, and as the match to go on from', () => {
    const entry = terminal({ selection: 'needle' })
    const { vm } = panel(entry, { text: 'before' })
    vm.search.isMissing = true

    vm.openSearch()
    expect(vm.search).toEqual({ isOpen: true, text: 'needle', isMissing: false })
    expect(entry.calls).toEqual([['findNext', 'needle']])
  })

  it('keeps the text of before for a selection over several lines', () => {
    const entry = terminal({ selection: 'one\ntwo' })
    const { vm } = panel(entry, { text: 'before' })

    vm.openSearch()
    expect(vm.search.text).toBe('before')
    expect(entry.calls).toEqual([])
  })

  it('closes with the keyboard back in the terminal, and without the complaint', () => {
    const entry = terminal()
    const { vm } = panel(entry, { text: 'zzz' })
    vm.search.isOpen = true
    vm.search.isMissing = true

    vm.closeSearch()
    expect(vm.search).toEqual({ isOpen: false, text: 'zzz', isMissing: false })
    expect(entry.calls).toEqual(['focus'])
  })

  it('closes when another tab is selected, keeping the text', () => {
    const { vm } = panel(terminal(), { text: 'needle' })
    vm.search.isOpen = true
    vm.search.isMissing = true

    component.watch.activeKey.call(vm)
    expect(vm.search).toEqual({ isOpen: false, text: 'needle', isMissing: false })
  })
})

describe('the font size keys', () => {
  it('change the setting by one step, and back to the default', () => {
    const { vm, dispatched } = panel(terminal(), { fontSize: 13 })

    vm.changeFontSize('font-up')
    vm.changeFontSize('font-down')
    expect(dispatched).toEqual([['settingChange', { terminalFontSize: 14 }], ['settingChange', { terminalFontSize: 12 }]])

    const big = panel(terminal(), { fontSize: 20 })
    big.vm.changeFontSize('font-reset')
    expect(big.dispatched).toEqual([['settingChange', { terminalFontSize: 13 }]])
  })

  it('change nothing at the ends and at the default', () => {
    for (const [fontSize, shortcut] of [[32, 'font-up'], [8, 'font-down'], [13, 'font-reset']]) {
      const { vm, dispatched } = panel(terminal(), { fontSize })
      vm.changeFontSize(shortcut)
      expect(dispatched).toEqual([])
    }
  })
})

describe('fitting a terminal', () => {
  const resized = () => {
    const calls = []
    vi.stubGlobal('window', { preload: { terminal: { resize: (...args) => calls.push(args) } } })
    return calls
  }

  it('gives a terminal in sight the font size of the setting, then fits it', () => {
    const calls = resized()
    const entry = terminal()
    const { vm } = panel(entry, { fontSize: 16 })

    vm.fit(entry)
    expect(entry.term.options.fontSize).toBe(16)
    expect(entry.calls).toEqual(['fit'])
    expect(calls).toEqual([])
  })

  // 숨은 화면은 잴 수 없다: 다시 보일 때 맞춘다
  it('leaves a hidden terminal as it is', () => {
    resized()
    const entry = terminal({ shown: false })
    const { vm } = panel(entry, { fontSize: 16 })

    vm.fit(entry)
    expect(entry.term.options.fontSize).toBe(13)
    expect(entry.calls).toEqual([])
  })

  it('tells the session its size when the columns or rows changed, or when asked to', () => {
    const calls = resized()
    const entry = terminal()
    entry.fit.fit = () => { entry.term.cols = 60 }
    const { vm } = panel(entry)

    vm.fit(entry)
    expect(calls).toEqual([[7, 60, 24]])
    vm.fit(entry)
    expect(calls).toHaveLength(1)
    vm.fit(entry, true)
    expect(calls).toEqual([[7, 60, 24], [7, 60, 24]])
  })

  it('tells nothing for a terminal whose session is not open yet', () => {
    const calls = resized()
    const entry = { ...terminal(), id: null }
    const { vm } = panel(entry)

    vm.fit(entry, true)
    expect(calls).toEqual([])
  })

  it('fits both halves and gives the keyboard to the selected one when asked', () => {
    resized()
    const left = terminal()
    const right = terminal()
    const { vm } = panel(left)
    vm.terms.set(2, right)
    vm.panes = { left: 1, right: 2 }
    vm.activeKey = 2

    vm.fitActive()
    expect([left.calls, right.calls]).toEqual([['fit'], ['fit']])
    vm.fitActive(true)
    expect([left.calls, right.calls]).toEqual([['fit', 'fit'], ['fit', 'fit', 'focus']])
  })
})
