import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canReconnect, CLIPBOARD_OSC, createActivityWatch, createOutputRouter, duplicateRefusal, endedByUser, isMotionReport, oscCopyText, reconnectRefusal, rightClickAction, terminalShortcut } from '../../utils/terminal-sessions'
import { endedLine, errorLine, nextFontSize, RECONNECTING_LINE, searchSeed } from '../../utils/terminal-view'
import { CONNECTED_DATA, CONNECTED_OSC } from '../../../../shared/terminal-marker.js'
import { MAX_WRITE } from '../../../../shared/terminal-input.js'
import { MAX_CLIPBOARD } from '../../../../shared/clipboard.js'
import { toastError } from '../../utils/notify'

// 터미널 패널의 찾기와 글꼴 크기. DOM 없이 도는 테스트라서 .vue를 불러올 수 없다: <script>의 내용을 꺼내 import만 바꿔서
// 돌리고, methods와 watch를 가짜 this로 부른다 (forward-menu.test.js와 같은 방법). xterm.js와 그 애드온은 쓰이지 않는다:
// 탭을 여는 start()가 만드는 터미널은 아래의 가짜이고, 만든 것을 차례로 made에 적는다.
const made = []
class FakeTerminal {
  constructor(options) {
    // windowsPty: xterm.js의 기본값처럼 빈 객체다 (OptionsService). 그래서 그것으로는 Windows인지 알 수 없다 (#252).
    // osc: 번호 -> 그 OSC의 처리기 (registerOscHandler)
    Object.assign(this, { options: { windowsPty: {}, ...options }, cols: 100, rows: 30, calls: [], disposed: false, osc: {}, element: null })
    this.parser = { registerOscHandler: (code, handler) => { this.osc[code] = handler } }
    made.push(this)
  }

  loadAddon() {}

  open(el) { this.calls.push(['open', el]) }

  focus() { this.calls.push('focus') }

  onData(listener) { this.typed = listener }

  write(data) { this.calls.push(['write', data]) }

  dispose() { this.disposed = true }
}
class FakeAddon {}

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'terminal-panel.vue'), 'utf8').replace(/\r\n/g, '\n')
const script = source.match(/<script>\n([\s\S]*?)<\/script>/)[1]
const imported = [...script.matchAll(/^import (?:\{ ([^}]+) \}|(\w+)) from .*$/gm)].flatMap(match => (match[1] ?? match[2]).split(', '))
const given = { nextFontSize, searchSeed, canReconnect, CLIPBOARD_OSC, createActivityWatch, createOutputRouter, duplicateRefusal, endedByUser, isMotionReport, oscCopyText, reconnectRefusal, rightClickAction, terminalShortcut, endedLine, errorLine, RECONNECTING_LINE, CONNECTED_DATA, CONNECTED_OSC, MAX_WRITE, MAX_CLIPBOARD, toastError, Terminal: FakeTerminal, FitAddon: FakeAddon, SearchAddon: FakeAddon, mapGetters: () => ({}) }
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
    write: data => calls.push(['write', data]),
    focus: () => calls.push('focus')
  }
  const search = {
    findNext: (text, options) => { calls.push(['findNext', text, options]); return found },
    findPrevious: (text, options) => { calls.push(['findPrevious', text, options]); return found }
  }
  return { term, search, fit: { fit: () => calls.push('fit') }, id: 7, calls }
}

// 가짜 this: 패널의 data와, 고른 탭의 터미널 하나
function panel(entry, { text = '', fontSize = 13 } = {}) {
  const dispatched = []
  const focused = []
  const toasts = []
  // 출력이 오가는지 보는 것 (createActivityWatch): 부른 차례를 적는다
  const activity = []
  const vm = {
    activity: { output: key => activity.push(['output', key]), forget: key => activity.push(['forget', key]), stop: () => activity.push(['stop']) },
    activeKey: 1,
    panes: { left: 1, right: null },
    fontSize,
    terms: new Map(entry ? [[1, entry]] : []),
    search: { isOpen: false, text, isMissing: false, caseSensitive: false },
    $refs: { search: { focus: () => focused.push('search') } },
    $nextTick: fn => fn(),
    $store: { dispatch: (...args) => dispatched.push(args) },
    $bvToast: { toast: (body, options) => toasts.push({ body, title: options.title, variant: options.variant }) }
  }
  for (const [name, method] of Object.entries(component.methods)) vm[name] = method.bind(vm)
  return { vm, dispatched, focused, toasts, activity }
}

afterEach(() => vi.unstubAllGlobals())

describe('the script of the terminal panel', () => {
  it('runs here without xterm.js', () => {
    expect(component.name).toBe('TerminalPanel')
    expect(imported).toContain('SearchAddon')
    expect(imported.length).toBeGreaterThan(15)
  })

  // 출력이 오가는지 store에 알린다: 그 노드의 초록 점이 깜박인다 (utils/terminal-sessions.js의 busyNodes)
  it('tells the store when the output of a tab starts and when it is over', () => {
    const commits = []
    const vm = { $store: { commit: (...args) => commits.push(args) } }
    component.created.call(vm)

    vm.activity.output(3)
    vm.activity.output(3)
    vm.activity.forget(3)
    expect(commits).toEqual([['terminalUpdate', { key: 3, busy: true }], ['terminalUpdate', { key: 3, busy: false }]])
  })
})

describe('what is typed into a terminal', () => {
  const written = () => {
    const calls = []
    vi.stubGlobal('window', { preload: { terminal: { write: (...args) => calls.push(args) } } })
    return calls
  }
  // 가짜 this에 세션 목록과 다시 접속한 것의 기록을 더한다
  const typing = entry => {
    const { vm, toasts } = panel(entry)
    const reconnected = []
    vm.allSessions = [{ key: 1, title: 'app' }, { key: 2, title: 'db' }]
    vm.reconnect = session => reconnected.push(session)
    return { vm, reconnected, toasts }
  }

  it('goes to the session of that terminal', () => {
    const calls = written()
    const entry = { ...terminal(), ended: false, interruptedAt: null }
    const { vm, reconnected } = typing(entry)

    vm.typed(1, entry, 'ls\r')
    expect(calls).toEqual([[7, 'ls\r']])
    expect(entry.interruptedAt).toBe(null)
    expect(reconnected).toEqual([])
  })

  // 포워딩(ssh -N)은 Ctrl+C로 끝내도 오류로 끝난다: 누른 때로 가려낸다
  it('remembers when Ctrl+C was pressed, also inside a paste', () => {
    written()
    vi.useFakeTimers()
    vi.setSystemTime(123456)
    const entry = { ...terminal(), ended: false, interruptedAt: null }
    const { vm } = typing(entry)

    vm.typed(1, entry, 'a\x03b')
    expect(entry.interruptedAt).toBe(123456)
    vi.useRealTimers()
  })

  // main은 한 번에 MAX_WRITE까지만 쓴다. 그보다 긴 붙여넣기는 말없이 버려졌다 (#220). 이제 보내지 않고 그렇다고 알린다.
  it('is not sent when it is longer than main takes (a paste), and says so', () => {
    const calls = written()
    const entry = { ...terminal(), ended: false, interruptedAt: null }
    const { vm, toasts } = typing(entry)

    // 붙여 넣은 글 안의 Ctrl+C도 보내지 않았으니 누른 것이 아니다
    vm.typed(1, entry, '\x1b[200~' + 'x'.repeat(MAX_WRITE - 12) + '\x03\x1b[201~')
    expect(calls).toEqual([])
    expect(entry.interruptedAt).toBe(null)
    expect(toasts).toEqual([{
      title: 'Paste not sent',
      variant: 'danger',
      body: 'The text is 65,537 characters long, and a terminal takes at most 65,536 at once. Paste it in parts, or copy a file with scp.'
    }])
  })

  it('goes whole when it is as long as main takes', () => {
    const calls = written()
    const entry = { ...terminal(), ended: false, interruptedAt: null }
    const { vm, toasts } = typing(entry)

    vm.typed(1, entry, 'x'.repeat(MAX_WRITE))
    expect(calls).toEqual([[7, 'x'.repeat(MAX_WRITE)]])
    expect(toasts).toEqual([])
  })

  it('waits while the session is not open yet', () => {
    const calls = written()
    const entry = { ...terminal(), id: null, ended: false, interruptedAt: null }
    const { vm } = typing(entry)

    vm.typed(1, entry, 'x')
    expect(calls).toEqual([])
  })

  // #252: Git의 ssh는 창 크기가 바뀐 뒤 ESC를 잃을 수 있다. 그러면 "[<35;10;5M"이 친 글자로 들어갔다 (Windows에서만)
  it('leaves out moves of the mouse without a button on Windows, and sends presses, drags and the wheel', () => {
    const calls = written()
    const entry = { ...terminal(), ended: false, interruptedAt: null, onWindows: true }
    const { vm } = typing(entry)

    for (const data of ['\x1b[<35;10;5M', '\x1b[<51;11;5M']) vm.typed(1, entry, data)
    expect(calls).toEqual([])
    for (const data of ['\x1b[<0;10;5M', '\x1b[<32;11;5M', '\x1b[<0;11;5m', '\x1b[<64;11;5M', 'ls\r']) vm.typed(1, entry, data)
    expect(calls).toEqual([[7, '\x1b[<0;10;5M'], [7, '\x1b[<32;11;5M'], [7, '\x1b[<0;11;5m'], [7, '\x1b[<64;11;5M'], [7, 'ls\r']])
  })

  it('sends every move of the mouse elsewhere', () => {
    const calls = written()
    const entry = { ...terminal(), ended: false, interruptedAt: null, onWindows: false }
    const { vm } = typing(entry)

    vm.typed(1, entry, '\x1b[<35;10;5M')
    expect(calls).toEqual([[7, '\x1b[<35;10;5M']])
  })

  it('is not sent to an ended session: Enter connects again, anything else is dropped', () => {
    const calls = written()
    const entry = { ...terminal(), ended: true, interruptedAt: null }
    const { vm, reconnected } = typing(entry)

    vm.typed(1, entry, 'x')
    vm.typed(1, entry, '\x03')
    expect(reconnected).toEqual([])
    expect(entry.interruptedAt).toBe(null)

    vm.typed(1, entry, '\r')
    expect(reconnected).toEqual([{ key: 1, title: 'app' }])
    expect(calls).toEqual([])
  })
})

describe('finding in the terminal of the selected tab', () => {
  it('starts from the newest output while typing: the selection goes first, then upwards', () => {
    const entry = terminal()
    const { vm } = panel(entry, { text: 'needle' })

    vm.find('first')
    expect(entry.calls).toEqual(['clearSelection', ['findPrevious', 'needle', { caseSensitive: false }]])
    expect(vm.search.isMissing).toBe(false)
  })

  it('goes up with previous and down with next, from the match', () => {
    const entry = terminal()
    const { vm } = panel(entry, { text: 'needle' })

    vm.find('previous')
    vm.find('next')
    expect(entry.calls).toEqual([['findPrevious', 'needle', { caseSensitive: false }], ['findNext', 'needle', { caseSensitive: false }]])
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

  // 대소문자 구분 (owner, 2026-10-15): 바꾸면 찾는 글이 바뀐 것처럼 맨 아래에서 다시 찾는다
  it('tells the terminal whether case matters, and starts again from the newest output when that changes', () => {
    const entry = terminal()
    const { vm } = panel(entry, { text: 'Needle' })

    vm.toggleCase()
    expect(vm.search.caseSensitive).toBe(true)
    vm.find('next')
    expect(entry.calls).toEqual(['clearSelection', ['findPrevious', 'Needle', { caseSensitive: true }], ['findNext', 'Needle', { caseSensitive: true }]])

    entry.calls.length = 0
    vm.toggleCase()
    expect(vm.search.caseSensitive).toBe(false)
    expect(entry.calls).toEqual(['clearSelection', ['findPrevious', 'Needle', { caseSensitive: false }]])
  })

  it('says at once whether the text is there with the other setting', () => {
    const entry = terminal()
    entry.search.findPrevious = (text, options) => !options.caseSensitive
    const { vm } = panel(entry, { text: 'NEEDLE' })

    vm.toggleCase()
    expect(vm.search.isMissing).toBe(true)
    vm.toggleCase()
    expect(vm.search.isMissing).toBe(false)
  })

  it('keeps it when the field closes, and takes a selection with it', () => {
    const entry = terminal({ selection: 'Needle' })
    const { vm } = panel(entry, { text: 'zzz' })
    vm.search.caseSensitive = true

    vm.closeSearch()
    vm.openSearch()
    expect(vm.search.caseSensitive).toBe(true)
    expect(entry.calls).toEqual(['focus', ['findNext', 'Needle', { caseSensitive: true }]])
  })
})

describe('opening and closing the search field', () => {
  it('opens with the text of before and the keyboard in the field', () => {
    const entry = terminal()
    const { vm, focused } = panel(entry, { text: 'before' })

    vm.openSearch()
    expect(vm.search).toEqual({ isOpen: true, text: 'before', isMissing: false, caseSensitive: false })
    expect(focused).toEqual(['search'])
    expect(entry.calls).toEqual([])
  })

  // 고른 자리를 찾은 것으로 해 둔다: 다음 Enter가 거기서 넘어간다
  it('takes a selection inside one line as the text, and as the match to go on from', () => {
    const entry = terminal({ selection: 'needle' })
    const { vm } = panel(entry, { text: 'before' })
    vm.search.isMissing = true

    vm.openSearch()
    expect(vm.search).toEqual({ isOpen: true, text: 'needle', isMissing: false, caseSensitive: false })
    expect(entry.calls).toEqual([['findNext', 'needle', { caseSensitive: false }]])
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
    expect(vm.search).toEqual({ isOpen: false, text: 'zzz', isMissing: false, caseSensitive: false })
    expect(entry.calls).toEqual(['focus'])
  })

  it('closes when another tab is selected, keeping the text', () => {
    const { vm } = panel(terminal(), { text: 'needle' })
    vm.search.isOpen = true
    vm.search.isMissing = true

    component.watch.activeKey.call(vm)
    expect(vm.search).toEqual({ isOpen: false, text: 'needle', isMissing: false, caseSensitive: false })
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

// 세션이 끝났을 때와 다시 접속할 때. 가짜 this에 세션 목록, 출력의 길(router), store에 한 commit의 기록을 더한다.
function ending(entry, session) {
  const { vm, activity } = panel(entry)
  const seen = { commits: [], unregistered: [], registered: [], closed: [] }
  vm.allSessions = [session]
  vm.router = { unregister: id => seen.unregistered.push(id), register: id => seen.registered.push(id) }
  vm.$store = { commit: (...args) => seen.commits.push(args) }
  vm.closeSession = closing => seen.closed.push(closing)
  return { vm, seen, activity }
}

describe('a session that ends', () => {
  it('stops counting as busy at once, whether its tab stays or closes', () => {
    const stays = ending({ ...terminal(), ended: false, interruptedAt: null }, { key: 1, id: 7, connected: false })
    stays.vm.onExit(7, 255)
    expect(stays.activity).toEqual([['forget', 1]])

    const closes = ending({ ...terminal(), ended: false, interruptedAt: null }, { key: 1, id: 7, connected: true })
    closes.vm.onExit(7, 0)
    expect(closes.activity).toEqual([['forget', 1]])
  })

  it('stays for reconnecting when the connection failed: a line says so and the tab is marked', () => {
    const entry = { ...terminal(), ended: false, interruptedAt: null }
    const session = { key: 1, id: 7, connected: false }
    const { vm, seen } = ending(entry, session)

    vm.onExit(7, 255)
    expect(entry.calls).toEqual([['write', endedLine(255)]])
    expect(entry.ended).toBe(true)
    expect(seen.commits).toEqual([['terminalUpdate', { key: 1, status: 'exited', exitCode: 255 }]])
    expect(seen.unregistered).toEqual([7])
    expect(seen.closed).toEqual([])
  })

  it('closes its tab when the user ended it: exit after the login, or Ctrl+C just before a 255', () => {
    const entry = { ...terminal(), ended: false, interruptedAt: null }
    const session = { key: 1, id: 7, connected: true }
    const first = ending(entry, session)
    first.vm.onExit(7, 0)
    expect(first.seen.closed).toEqual([session])
    expect(entry.calls).toEqual([])
    expect(entry.ended).toBe(false)
    expect(first.seen.commits).toEqual([])
    expect(first.seen.unregistered).toEqual([7])

    const stopped = { ...terminal(), ended: false, interruptedAt: Date.now() }
    const forward = { key: 1, id: 7, connected: false }
    const second = ending(stopped, forward)
    second.vm.onExit(7, 255)
    expect(second.seen.closed).toEqual([forward])
  })

  it('is nothing to the panel when the id is of no tab', () => {
    const entry = { ...terminal(), ended: false, interruptedAt: null }
    const { vm, seen } = ending(entry, { key: 1, id: 7, connected: false })

    vm.onExit(8, 255)
    expect(seen).toEqual({ commits: [], unregistered: [], registered: [], closed: [] })
    expect(entry.calls).toEqual([])
  })
})

describe('connecting an ended tab again', () => {
  // main이 다시 연 세션의 답을 테스트가 정한다
  const reopening = () => {
    const calls = []
    let answer
    const asked = new Promise(resolve => { answer = resolve })
    vi.stubGlobal('window', {
      preload: {
        terminal: {
          reopen: (...args) => { calls.push(['reopen', ...args]); return asked },
          close: id => calls.push(['close', id]),
          resize: () => {}
        }
      }
    })
    return { calls, answer }
  }
  const ended = () => {
    const entry = { ...terminal(), ended: true, reconnecting: false, interruptedAt: 5 }
    const session = { key: 1, id: 7, status: 'exited', exitCode: 255, connected: false }
    return { entry, session, ...ending(entry, session) }
  }

  it('asks main for the same session with the size of the screen, and says so in the tab', async () => {
    const { calls, answer } = reopening()
    const { entry, session, vm, seen } = ended()

    const done = vm.reconnect(session)
    expect(calls).toEqual([['reopen', 7, { cols: 80, rows: 24 }]])
    expect(seen.commits).toEqual([['terminalUpdate', { key: 1, status: 'starting', connected: false, exitCode: null }]])
    expect(entry.calls).toEqual([['write', RECONNECTING_LINE]])
    expect(entry.reconnecting).toBe(true)

    answer({ ok: true, id: 9, windowsPty: { backend: 'conpty', buildNumber: 21376 } })
    await done
    expect(entry).toMatchObject({ id: 9, ended: false, reconnecting: false, interruptedAt: null })
    expect(entry.term.options.windowsPty).toEqual({ backend: 'conpty', buildNumber: 21376 })
    expect(seen.registered).toEqual([9])
    expect(seen.commits[1]).toEqual(['terminalUpdate', { key: 1, id: 9, status: 'running' }])
    expect(entry.calls.at(-1)).toBe('focus')
  })

  it('does not ask twice while the answer is not there, and not for a tab that cannot be reconnected', async () => {
    const { calls, answer } = reopening()
    const { entry, session, vm } = ended()

    const done = vm.reconnect(session)
    vm.reconnect(session)
    expect(calls).toHaveLength(1)
    answer({ ok: true, id: 9 })
    await done

    await vm.reconnect({ key: 1, id: 9, status: 'running' })
    await vm.reconnect({ key: 1, id: null, status: 'exited' })
    await vm.reconnect({ key: 99, id: 7, status: 'exited' })
    await vm.reconnect(undefined)
    expect(calls).toHaveLength(1)
    expect(entry.reconnecting).toBe(false)
  })

  it('stays ended with the reason and the old exit code when main cannot open it', async () => {
    const { answer } = reopening()
    const { entry, session, vm, seen } = ended()

    const done = vm.reconnect(session)
    answer({ ok: false, error: 'no bash' })
    await done
    expect(entry.calls).toEqual([['write', RECONNECTING_LINE], ['write', errorLine('no bash')]])
    expect(entry).toMatchObject({ id: 7, ended: true, reconnecting: false, interruptedAt: 5 })
    expect(seen.commits[1]).toEqual(['terminalUpdate', { key: 1, status: 'exited', exitCode: 255 }])
    expect(seen.registered).toEqual([])
  })

  it('ends the new session when the tab was closed while waiting', async () => {
    const { calls, answer } = reopening()
    const { entry, session, vm, seen } = ended()

    const done = vm.reconnect(session)
    vm.terms.delete(1)
    answer({ ok: true, id: 9 })
    await done
    expect(calls.at(-1)).toEqual(['close', 9])
    expect(entry.id).toBe(7)
    expect(seen.registered).toEqual([])
    expect(seen.commits).toHaveLength(1)
  })

  // main은 열지 못한 요청을 다시 시도할 수 있게 옛 id로 다시 기억해 둔다. 탭을 닫을 때의 close가 그보다 먼저 닿았으면
  // (open의 첫 await 뒤의 실패) 탭이 없는 요청이 남는다: 옛 id를 한 번 더 닫는다 (#261)
  it('has main forget the request it kept again when the tab was closed while waiting and could not be opened', async () => {
    const { calls, answer } = reopening()
    const { entry, session, vm, seen } = ended()

    const done = vm.reconnect(session)
    vm.terms.delete(1)
    answer({ ok: false, error: 'Cannot create process, error code: 216' })
    await done
    expect(calls.filter(call => call[0] === 'close')).toEqual([['close', 7]])
    expect(entry.calls).toEqual([['write', RECONNECTING_LINE]])
    expect(seen.registered).toEqual([])
    expect(seen.commits).toHaveLength(1)
  })

  // 다른 탭이 이 포워딩 탭의 로컬 포트를 포워딩하는 동안은 ssh가 곧바로 끝난다 (owner, 2026-10-17, #264)
  it('does not connect a forwarding tab again while another tab, also of another space, forwards its port, says so in the tab, and does once that tab has ended', async () => {
    const { calls, answer } = reopening()
    const entry = { ...terminal(), ended: true, reconnecting: false, interruptedAt: 5 }
    const session = { key: 1, id: 7, kind: 'forward', ports: ['8080'], status: 'exited', exitCode: 255, connected: false, owner: 0 }
    const { vm, seen } = ending(entry, session)
    // 포트는 이 컴퓨터의 것이다: 다른 스페이스의 탭이 쥐어도 그렇다 (sessions는 열린 스페이스의 탭뿐이다)
    const copy = { key: 2, id: 8, kind: 'forward', ports: ['8080'], status: 'running', owner: 1 }
    vm.sessions = [session]
    vm.allSessions = [session, copy]

    await vm.reconnect(session)
    expect(calls).toEqual([])
    expect(entry.calls).toEqual([['write', errorLine('Local port 8080 is forwarded by another tab now, so this one could not forward it. Press Enter again once that tab has ended.')]])
    expect(entry).toMatchObject({ id: 7, ended: true, reconnecting: false })
    expect(seen.commits).toEqual([])

    vm.allSessions = [session, { ...copy, status: 'exited', exitCode: 255 }]
    const done = vm.reconnect(session)
    expect(calls).toEqual([['reopen', 7, { cols: 80, rows: 24 }]])
    answer({ ok: true, id: 9 })
    await done
    expect(entry).toMatchObject({ id: 9, ended: false })
  })
})

// 탭을 열 때. main의 답(terminal:open)은 테스트가 정한다. 가짜 this에는 탭의 화면이 놓일 자리와 store, 출력의 길을 둔다.
function opening() {
  const calls = []
  let answer
  const asked = new Promise(resolve => { answer = resolve })
  vi.stubGlobal('window', {
    preload: {
      terminal: {
        open: (...args) => { calls.push(['open', ...args]); return asked },
        duplicate: (...args) => { calls.push(['duplicate', ...args]); return asked },
        close: id => calls.push(['close', id]),
        resize: (...args) => calls.push(['resize', ...args])
      }
    }
  })
  const { vm, activity } = panel(null)
  const seen = { commits: [], registered: [], unregistered: [] }
  const session = { key: 1, request: { kind: 'connect', payload: { host: 'app.test' } } }
  const screen = { name: 'the place of tab 1' }
  vm.allSessions = [session]
  vm.$refs['term-1'] = [screen]
  vm.$store = { commit: (...args) => seen.commits.push(args) }
  vm.router = { register: (id, write) => seen.registered.push([id, write]), unregister: id => seen.unregistered.push(id) }
  vm.colors = () => ({ background: '#000' })
  vm.drawWithWebgl = () => {}
  vm.enableShortcuts = () => {}
  const closes = () => calls.filter(([op]) => op === 'close')
  return { vm, calls, closes, answer, seen, session, screen, activity }
}

describe('opening a session', () => {
  it('hands the output of main to the screen of the tab and counts it as output of that tab', async () => {
    const { vm, answer, seen, session, activity } = opening()

    const done = vm.start(session)
    const term = made.at(-1)
    expect(vm.terms.get(1).onWindows).toBe(false)
    answer({ ok: true, id: 9 })
    await done
    // windowsPty가 없다: Windows가 아니다 (xterm.js의 term.options.windowsPty는 기본값이 {}라서 그것으로는 알 수 없다)
    expect(vm.terms.get(1).onWindows).toBe(false)
    const [[id, write]] = seen.registered
    write('hello')
    expect(id).toBe(9)
    expect(term.calls.at(-1)).toEqual(['write', 'hello'])
    expect(activity).toEqual([['output', 1]])
  })

  it('makes the screen of the tab, asks main with the request and the size, and takes the request out of the store', async () => {
    const { vm, calls, answer, seen, session, screen } = opening()

    const done = vm.start(session)
    const term = made.at(-1)
    expect(seen.commits).toEqual([['terminalUpdate', { key: 1, request: null }]])
    expect(term.calls).toEqual([['open', screen], 'focus'])
    expect(term.options).toMatchObject({ cursorBlink: false, fontSize: 13, theme: { background: '#000' } })
    expect(vm.terms.get(1)).toMatchObject({ term, id: null, ended: false })
    expect(calls).toEqual([['open', 'connect', { host: 'app.test' }, { cols: 100, rows: 30 }]])

    answer({ ok: true, id: 9, windowsPty: { backend: 'conpty', buildNumber: 21376 } })
    await done
    expect(vm.terms.get(1).id).toBe(9)
    expect(term.options.windowsPty).toEqual({ backend: 'conpty', buildNumber: 21376 })
    // main은 Windows에서만 windowsPty를 준다: 그 터미널은 버튼 없는 마우스 이동을 보내지 않는다 (typed, #252)
    expect(vm.terms.get(1).onWindows).toBe(true)
    expect(seen.registered.map(([id]) => id)).toEqual([9])
    expect(seen.commits.at(-1)).toEqual(['terminalUpdate', { key: 1, id: 9, status: 'running' }])
    // 받은 출력은 그 탭의 화면으로 간다
    seen.registered[0][1]('hello')
    expect(term.calls.at(-1)).toEqual(['write', 'hello'])
    expect(calls).toHaveLength(1)
  })

  it('marks the tab as connected when ssh prints its sign after the login, and for nothing else', async () => {
    const { vm, answer, seen, session } = opening()

    const done = vm.start(session)
    answer({ ok: true, id: 9 })
    await done
    const handler = made.at(-1).osc[CONNECTED_OSC]
    expect(handler('something else')).toBe(true)
    expect(seen.commits.some(([, patch]) => patch.connected)).toBe(false)
    expect(handler(CONNECTED_DATA)).toBe(true)
    expect(seen.commits.at(-1)).toEqual(['terminalUpdate', { key: 1, connected: true }])
  })

  // #271: tmux는 복사한 글을 OSC 52로 보낸다. 쓰기만 한다: 읽어 달라는 것에 답하면 서버가 이 PC의 클립보드를 읽는다.
  // (가짜 preload에는 terminal.write가 없다: 터미널이 무엇이든 보내면 여기서 던진다)
  it('puts the text a program on the server copies into the clipboard, also from a tab not in front, and tells it nothing', async () => {
    const { vm, answer, seen, session } = opening()
    const copied = []
    window.preload.clipboard = { writeText: text => copied.push(text), readText: () => { throw new Error('the clipboard was read') } }

    const done = vm.start(session)
    answer({ ok: true, id: 9 })
    await done
    const handler = made.at(-1).osc[CLIPBOARD_OSC]
    const commits = seen.commits.length
    expect(handler(`;${Buffer.from('copied in tmux 한글').toString('base64')}`)).toBe(true)
    expect(copied).toEqual(['copied in tmux 한글'])
    vm.activeKey = 5
    expect(handler(`c;${Buffer.from('from behind').toString('base64')}`)).toBe(true)
    expect(copied).toEqual(['copied in tmux 한글', 'from behind'])
    // 읽어 달라는 것, 빈 글, 고장 난 base64, 붙여 넣으면 괄호 붙여넣기를 끝내는 글: 클립보드는 그대로다
    for (const data of ['c;?', 'c;', 'c;@@@@', `c;${Buffer.from('ls\x1b[201~echo run\r').toString('base64')}`]) expect(handler(data)).toBe(true)
    expect(copied).toHaveLength(2)
    expect(seen.commits).toHaveLength(commits)
  })

  it('says why in the tab when main cannot open it', async () => {
    const { vm, closes, answer, seen, session } = opening()

    const done = vm.start(session)
    answer({ ok: false, error: 'no bash' })
    await done
    expect(made.at(-1).calls.at(-1)).toEqual(['write', errorLine('no bash')])
    expect(seen.commits.at(-1)).toEqual(['terminalUpdate', { key: 1, status: 'failed' }])
    expect(vm.terms.get(1).id).toBe(null)
    expect(seen.registered).toEqual([])
    expect(closes()).toEqual([])
  })

  // 탭을 닫을 때는 세션의 번호를 아직 모른다: 답이 오면 그때 닫는다. 닫지 않으면 그 세션은 탭 없이 main에서 계속 돈다
  // (ssh는 로그인까지 가고, 서버에는 보는 화면 없이 접속한 채로 남는다).
  it('ends the session main opened when the tab was closed while waiting', async () => {
    const { vm, calls, closes, answer, seen, session } = opening()

    const done = vm.start(session)
    const entry = vm.terms.get(1)
    vm.closeSession(session)
    expect(closes()).toEqual([])
    expect(entry.term.disposed).toBe(true)

    answer({ ok: true, id: 9, windowsPty: { backend: 'conpty' } })
    await done
    expect(calls.at(-1)).toEqual(['close', 9])
    expect(entry.id).toBe(null)
    expect(entry.term.options.windowsPty).toEqual({})
    expect(seen.registered).toEqual([])
    expect(seen.commits.map(([name]) => name)).toEqual(['terminalUpdate', 'terminalRemove'])
  })

  it('leaves a closed tab alone when main could not open its session either', async () => {
    const { vm, closes, answer, seen, session } = opening()

    const done = vm.start(session)
    const { term } = vm.terms.get(1)
    vm.closeSession(session)
    const written = term.calls.length
    answer({ ok: false, error: 'no bash' })
    await done
    expect(term.calls).toHaveLength(written)
    expect(closes()).toEqual([])
    expect(seen.commits.map(([name]) => name)).toEqual(['terminalUpdate', 'terminalRemove'])
  })

  // 탭을 Ctrl+클릭해서 연 탭 (#257): 요청은 main의 세션에 있고, 탭은 그 세션의 id만 갖는다.
  it('asks main for another session like the one of the tab it was opened from, with the size of its screen', async () => {
    const { vm, calls, answer, seen } = opening()
    const session = { key: 1, request: { duplicateOf: 4 } }
    vm.allSessions = [session]

    const done = vm.start(session)
    expect(seen.commits).toEqual([['terminalUpdate', { key: 1, request: null }]])
    expect(calls).toEqual([['duplicate', 4, { cols: 100, rows: 30 }]])
    answer({ ok: true, id: 9, windowsPty: { backend: 'conpty', buildNumber: 21376 } })
    await done
    expect(vm.terms.get(1)).toMatchObject({ id: 9, onWindows: true })
    expect(seen.registered.map(([id]) => id)).toEqual([9])
    expect(seen.commits.at(-1)).toEqual(['terminalUpdate', { key: 1, id: 9, status: 'running' }])
    expect(calls).toHaveLength(1)
  })

  it('says why in the new tab when main has no such session any more, and ends the copy main opened for a tab closed meanwhile', async () => {
    const first = opening()
    const copy = { key: 1, request: { duplicateOf: 4 } }
    first.vm.allSessions = [copy]
    const done = first.vm.start(copy)
    first.answer({ ok: false, error: 'This terminal can no longer be opened again. Start it from its node.' })
    await done
    expect(made.at(-1).calls.at(-1)).toEqual(['write', errorLine('This terminal can no longer be opened again. Start it from its node.')])
    expect(first.seen.commits.at(-1)).toEqual(['terminalUpdate', { key: 1, status: 'failed' }])

    const second = opening()
    second.vm.allSessions = [copy]
    const waiting = second.vm.start(copy)
    second.vm.closeSession(copy)
    second.answer({ ok: true, id: 9 })
    await waiting
    expect(second.calls.at(-1)).toEqual(['close', 9])
    expect(second.seen.registered).toEqual([])
  })
})

describe('a tab clicked with Ctrl', () => {
  const clicking = () => {
    const { vm, toasts } = panel(null)
    const commits = []
    vm.$store = { commit: (...args) => commits.push(args) }
    return { vm, toasts, commits }
  }

  it('opens the same connection again in a new tab, for a tab whose session runs or ended', () => {
    const { vm, toasts, commits } = clicking()

    vm.duplicate({ key: 3, id: 7, status: 'running', connected: true })
    vm.duplicate({ key: 4, id: 8, status: 'exited', exitCode: 255 })
    vm.duplicate({ key: 5, id: 9, kind: 'forward', status: 'exited', exitCode: 255 })
    expect(commits).toEqual([['terminalDuplicate', 3], ['terminalDuplicate', 4], ['terminalDuplicate', 5]])
    expect(toasts).toEqual([])
  })

  // 돌고 있는 포워딩 탭의 복사본은 그 포트를 열지 못하고 곧바로 끝난다 (#258)
  it('opens nothing for a forwarding tab that runs, and says why', () => {
    const { vm, toasts, commits } = clicking()

    vm.duplicate({ key: 3, id: 7, kind: 'forward', status: 'running', connected: true })
    expect(commits).toEqual([])
    expect(toasts.map(({ title, body }) => [title, body])).toEqual([
      ['Not opened again', 'The ports this tab forwards are in use while it runs, so a second tab could not forward them. Open it again once it has ended.']
    ])
  })

  // 끝난 포워딩 탭이라도 그 포트를 다른 탭이 지금 포워딩하면 (#264): 다른 스페이스의 탭도 센다 (allSessions)
  it('opens nothing for an ended forwarding tab while another tab, also of another space, forwards its port', () => {
    const { vm, toasts, commits } = clicking()
    const ended = { key: 3, id: 7, kind: 'forward', ports: ['8080'], status: 'exited', exitCode: 255, owner: 0 }
    vm.sessions = [ended]
    vm.allSessions = [ended, { key: 4, id: 8, kind: 'forward', ports: ['8080'], status: 'running', owner: 1 }]

    vm.duplicate(ended)
    expect(commits).toEqual([])
    expect(toasts.map(({ title, body }) => [title, body])).toEqual([
      ['Not opened again', 'Local port 8080 is forwarded by another tab now, so a new tab could not forward it. Open it again once that tab has ended.']
    ])

    vm.allSessions = [ended, { key: 4, id: 8, kind: 'forward', ports: ['8080'], status: 'exited', exitCode: 255, owner: 1 }]
    vm.duplicate(ended)
    expect(commits).toEqual([['terminalDuplicate', 3]])
  })

  it('opens nothing and says why for a tab that is still opening, or connecting again, or that did not start', () => {
    const { vm, toasts, commits } = clicking()

    vm.duplicate({ key: 3, id: null, status: 'starting' })
    vm.duplicate({ key: 4, id: 8, status: 'starting' })
    vm.duplicate({ key: 5, id: null, status: 'failed' })
    expect(commits).toEqual([])
    expect(toasts.map(({ title, body }) => [title, body])).toEqual([
      ['Not opened again', 'This terminal is still opening. Try again once it is open.'],
      ['Not opened again', 'This terminal is still opening. Try again once it is open.'],
      ['Not opened again', 'This terminal did not start. Start it from its node.']
    ])
  })
})

// 탭 줄을 쓴 뒤 키보드가 있을 곳 (#266): 다른 탭을 고르지 않았으면 앞의 터미널이다. 탭을 누르면 키보드가 탭으로 가서,
// 고른 탭을 누르거나, Ctrl+클릭이 아무것도 열지 않거나, 탭을 끈 뒤에는 친 것이 아무 데도 가지 않았다.
describe('the keyboard after a use of the tab row', () => {
  const using = ({ isOpen = true } = {}) => {
    const front = terminal()
    const { vm, toasts } = panel(front)
    const commits = []
    vm.$store = { commit: (...args) => commits.push(args) }
    vm.isOpen = isOpen
    return { vm, front, commits, toasts }
  }

  it('is in the terminal of the selected tab after a click on that tab, which changes nothing else', () => {
    const { vm, front, commits } = using()

    vm.selectTab(1)
    expect(front.calls).toEqual(['focus'])
    expect(commits).toEqual([])
  })

  // 고른 탭이 바뀌면 패널이 그 터미널을 보이면서 키보드를 준다 (shownKeys): 여기서는 고르기만 한다.
  it('follows another tab that is clicked: that tab is selected', () => {
    const { vm, front, commits } = using()

    vm.selectTab(2)
    expect(commits).toEqual([['terminalActivate', 2]])
    expect(front.calls).toEqual([])
  })

  it('comes with the panel when the selected tab of a minimized panel is clicked: the panel is shown again', () => {
    const { vm, front, commits } = using({ isOpen: false })

    vm.selectTab(1)
    expect(commits).toEqual([['terminalActivate', 1]])
    expect(front.calls).toEqual([])
  })

  it('goes back to the terminal in front after a Ctrl+click that opens nothing, on that tab or another one, and is left to the copy otherwise', () => {
    const { vm, front, commits, toasts } = using()

    vm.duplicate({ key: 1, id: null, status: 'starting' })
    vm.duplicate({ key: 3, id: null, status: 'failed' })
    expect(toasts.length).toBe(2)
    expect(front.calls).toEqual(['focus', 'focus'])

    vm.duplicate({ key: 3, id: 8, status: 'running', connected: true })
    expect(commits).toEqual([['terminalDuplicate', 3]])
    expect(front.calls).toEqual(['focus', 'focus'])
  })

  // 끌기가 끝난 것은 바뀐 순서를 다시 그린 뒤에 온다 (vuedraggable, terminal-tabs.test.js)
  it('goes back to the terminal in front at the end of a drag of a tab', () => {
    const { vm, front, commits } = using()

    vm.dragged()
    expect(front.calls).toEqual(['focus'])
    expect(commits).toEqual([])
  })
})

describe('closing a tab', () => {
  // 가짜 this에 main에 한 요청과 store에 한 commit의 기록을 더한다. 화면을 놓아주는 것(dispose)은 터미널의 기록에 남는다.
  const closing = entry => {
    const calls = []
    vi.stubGlobal('window', { preload: { terminal: { close: id => calls.push(['close', id]) } } })
    const { vm, activity } = panel(entry)
    const seen = { commits: [], unregistered: [] }
    vm.$store = { commit: (...args) => seen.commits.push(args) }
    vm.router = { unregister: id => seen.unregistered.push(id) }
    return { vm, calls, seen, activity }
  }
  const screen = extra => {
    const entry = { ...terminal(), ended: false, ...extra }
    entry.term.dispose = () => entry.calls.push('dispose')
    return entry
  }

  it('ends its session, lets go of its screen and takes the tab out of the list', () => {
    const entry = screen()
    const { vm, calls, seen, activity } = closing(entry)

    vm.closeSession({ key: 1 })
    expect(activity).toEqual([['forget', 1]])
    expect(calls).toEqual([['close', 7]])
    expect(seen.unregistered).toEqual([7])
    expect(entry.calls).toEqual(['dispose'])
    expect(vm.terms.has(1)).toBe(false)
    expect(seen.commits).toEqual([['terminalRemove', 1]])
  })

  // 끝난 세션의 번호로도 닫는다: main이 다시 접속하려고 기억해 둔 요청을 잊는다
  it('tells main about an ended session too, and has nothing to tell for one that is not open yet', () => {
    const ended = screen({ ended: true })
    const first = closing(ended)
    first.vm.closeSession({ key: 1 })
    expect(first.calls).toEqual([['close', 7]])

    const waiting = screen({ id: null })
    const second = closing(waiting)
    second.vm.closeSession({ key: 1 })
    expect(second.calls).toEqual([])
    expect(second.seen.unregistered).toEqual([])
    expect(waiting.calls).toEqual(['dispose'])
    expect(second.vm.terms.has(1)).toBe(false)
    expect(second.seen.commits).toEqual([['terminalRemove', 1]])
  })

  it('takes a tab without a screen out of the list', () => {
    const { vm, calls, seen } = closing(null)

    vm.closeSession({ key: 5 })
    expect(calls).toEqual([])
    expect(seen.commits).toEqual([['terminalRemove', 5]])
  })

  it('gives the keyboard to the tab that is selected after it', () => {
    const next = screen()
    const { vm } = closing(screen())
    vm.terms.set(2, next)
    // store가 옆 탭을 고른다
    vm.$store = { commit: () => Object.assign(vm, { activeKey: 2, panes: { left: 2, right: null } }) }

    vm.closeSession({ key: 1 })
    expect(next.calls).toEqual(['fit', 'focus'])
  })

  it('closes every tab of the diagrams that were removed, and no other', () => {
    const { vm } = closing(null)
    const closed = []
    vm.allSessions = [{ key: 1, owner: 0 }, { key: 2, owner: 3 }, { key: 3, owner: 1 }, { key: 4, owner: 3 }]
    vm.closeSession = session => closed.push(session.key)

    vm.closeOwners([3, 0])
    expect(closed).toEqual([1, 2, 4])
    vm.closeOwners([])
    expect(closed).toHaveLength(3)
  })
})

describe('the panel going away', () => {
  it('ends every session and stops listening, and ends the one main opens after that', async () => {
    const { vm, closes, answer, session, activity } = opening()
    const stopped = []
    Object.assign(vm, {
      stopData: () => stopped.push('data'),
      stopExit: () => stopped.push('exit'),
      observer: { disconnect: () => stopped.push('observer') },
      spaceObserver: { disconnect: () => stopped.push('space') }
    })
    const open = { ...terminal(), ended: false }
    open.term.dispose = () => open.calls.push('dispose')
    vm.terms.set(2, open)

    const done = vm.start(session)
    const waiting = vm.terms.get(1)
    component.beforeDestroy.call(vm)
    expect(stopped).toEqual(['data', 'exit', 'observer', 'space'])
    expect(activity).toEqual([['stop']])
    expect(closes()).toEqual([['close', 7]])
    expect([open.calls, waiting.term.disposed]).toEqual([['dispose'], true])

    answer({ ok: true, id: 9 })
    await done
    expect(closes()).toEqual([['close', 7], ['close', 9]])
    expect(waiting.id).toBe(null)
  })
})

// 터미널의 키와 오른쪽 클릭. 가짜 터미널이 받은 처리기를 꺼내서 부른다.
describe('the keys and the right click of a terminal', () => {
  const wired = ({ selection = '', clipboard = 'PASTED', mouseTracking = 'none' } = {}) => {
    const calls = []
    let selected = selection
    let onKey, onMenu
    const term = {
      modes: { mouseTrackingMode: mouseTracking },
      hasSelection: () => selected !== '',
      getSelection: () => selected,
      clearSelection: () => { selected = ''; calls.push('clearSelection') },
      paste: text => calls.push(['paste', text]),
      focus: () => calls.push('focus'),
      attachCustomKeyEventHandler: fn => { onKey = fn }
    }
    const el = { addEventListener: (name, fn) => { if (name === 'contextmenu') onMenu = fn } }
    vi.stubGlobal('window', {
      preload: { clipboard: { writeText: text => calls.push(['copy', text]), readText: async () => clipboard } }
    })
    const { vm, toasts } = panel(null)
    vm.changeFontSize = shortcut => calls.push(['font', shortcut])
    vm.openSearch = () => calls.push('find')
    vm.enableShortcuts(term, el)
    // 키 하나를 누른다: 처리기의 답(true = 터미널이 그대로 처리)과, 브라우저의 기본 동작을 막았는지
    const press = async (code, key, more = {}) => {
      let prevented = false
      const passed = onKey({ type: 'keydown', ctrlKey: true, code, key, preventDefault: () => { prevented = true }, ...more })
      await Promise.resolve()
      await Promise.resolve()
      return { passed, prevented }
    }
    const rightClick = async (more = {}) => {
      let prevented = false
      await onMenu({ preventDefault: () => { prevented = true }, shiftKey: false, ...more })
      return prevented
    }
    return { calls, press, rightClick, toasts }
  }

  it('leaves a key that is no shortcut to the terminal', async () => {
    const { calls, press } = wired()
    expect(await press('KeyA', 'a')).toEqual({ passed: true, prevented: false })
    expect(await press('KeyC', 'c')).toEqual({ passed: true, prevented: false })
    expect(calls).toEqual([])
  })

  it('copies the selection with Ctrl+C and lets go of it, so the next Ctrl+C interrupts', async () => {
    const { calls, press } = wired({ selection: 'picked' })
    expect(await press('KeyC', 'c')).toEqual({ passed: false, prevented: true })
    expect(calls).toEqual([['copy', 'picked'], 'clearSelection'])
    expect(await press('KeyC', 'c')).toEqual({ passed: true, prevented: false })
  })

  it('keeps the selection after Ctrl+Shift+C and Ctrl+Insert', async () => {
    const { calls, press } = wired({ selection: 'picked' })
    await press('KeyC', 'C', { shiftKey: true })
    await press('Insert', 'Insert')
    expect(calls).toEqual([['copy', 'picked'], ['copy', 'picked']])
  })

  // main은 MAX_CLIPBOARD보다 긴 것을 쓰지 않는다. 예전에는 그런 복사가 말없이 되지 않았다 (#221).
  // (긴 글은 길이로 비교한다: 틀렸을 때 16 MB의 차이를 찍지 않게)
  const brief = calls => calls.map(call => (Array.isArray(call) ? [call[0], call[1].length] : call))

  it('does not copy a selection longer than main takes, says so and keeps the selection', async () => {
    const { calls, press, rightClick, toasts } = wired({ selection: 'x'.repeat(MAX_CLIPBOARD + 1) })
    const said = {
      title: 'Not copied',
      variant: 'danger',
      body: 'The selection is 16,777,217 characters long, and at most 16,777,216 can be copied. Select less of it.'
    }

    // Ctrl+C는 프로그램에 가지 않는다: 복사하려던 것이다
    expect(await press('KeyC', 'c')).toEqual({ passed: false, prevented: true })
    expect(await rightClick()).toBe(true)
    expect(brief(calls)).toEqual([])
    expect(toasts).toEqual([said, said])
  })

  it('copies a selection as long as main takes', async () => {
    const { calls, press, toasts } = wired({ selection: 'x'.repeat(MAX_CLIPBOARD) })
    await press('KeyC', 'c')
    expect(brief(calls)).toEqual([['copy', MAX_CLIPBOARD], 'clearSelection'])
    expect(toasts).toEqual([])
  })

  // 터미널 하나가 담는 것은 다 복사할 수 있어야 한다: 지나간 출력과 화면의 줄들(넉넉히 500줄), 줄마다 1600칸과 줄바꿈.
  // 예전의 1 MB는 꽉 찬 출력을 넓은 창에서 다 고르면 넘었다.
  it('takes more than a terminal holds', () => {
    const scrollback = Number(source.match(/scrollback: (\d+),/)[1])
    expect(scrollback).toBeGreaterThan(0)
    expect(MAX_CLIPBOARD).toBeGreaterThan((scrollback + 500) * 1601)
  })

  it('copies nothing with Ctrl+Shift+C when nothing is selected, and still keeps the key from the program', async () => {
    const { calls, press } = wired()
    expect(await press('KeyC', 'C', { shiftKey: true })).toEqual({ passed: false, prevented: true })
    expect(calls).toEqual([])
  })

  it('pastes the clipboard with Ctrl+V, once: the browser is kept from pasting too', async () => {
    const { calls, press } = wired()
    expect(await press('KeyV', 'v')).toEqual({ passed: false, prevented: true })
    expect(calls).toEqual([['paste', 'PASTED']])
  })

  it('pastes nothing from an empty clipboard', async () => {
    const { calls, press } = wired({ clipboard: '' })
    await press('KeyV', 'v')
    expect(calls).toEqual([])
  })

  it('hands the font size keys and the search key to the panel', async () => {
    const { calls, press } = wired()
    await press('Equal', '=')
    await press('Minus', '-')
    await press('Digit0', '0')
    expect(await press('KeyF', 'F', { shiftKey: true })).toEqual({ passed: false, prevented: true })
    expect(calls).toEqual([['font', 'font-up'], ['font', 'font-down'], ['font', 'font-reset'], 'find'])
  })

  it('copies on a right click with a selection and lets go of it', async () => {
    const { calls, rightClick } = wired({ selection: 'picked' })
    expect(await rightClick()).toBe(true)
    expect(calls).toEqual([['copy', 'picked'], 'clearSelection'])
  })

  it('pastes on a right click without a selection and keeps the keyboard in the terminal', async () => {
    const { calls, rightClick } = wired()
    await rightClick()
    expect(calls).toEqual([['paste', 'PASTED'], 'focus'])
  })

  // tmux의 mouse on, vim: 그 클릭은 프로그램의 것이다. 여기서 붙여넣으면 클립보드의 글이 프로그램에 함께 들어간다.
  it('does nothing on a right click while the program takes the mouse, unless Shift is held', async () => {
    const { calls, rightClick } = wired({ mouseTracking: 'vt200' })
    expect(await rightClick()).toBe(true)
    expect(calls).toEqual([])
    await rightClick({ shiftKey: true })
    expect(calls).toEqual([['paste', 'PASTED'], 'focus'])
  })
})
