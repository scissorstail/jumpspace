import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canReconnect, endedByUser, rightClickAction, terminalShortcut } from '../../utils/terminal-sessions'
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
    Object.assign(this, { options, cols: 100, rows: 30, calls: [], disposed: false, osc: null, element: null })
    this.parser = { registerOscHandler: (code, handler) => { this.osc = { code, handler } } }
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
const given = { nextFontSize, searchSeed, canReconnect, endedByUser, rightClickAction, terminalShortcut, endedLine, errorLine, RECONNECTING_LINE, CONNECTED_DATA, CONNECTED_OSC, MAX_WRITE, MAX_CLIPBOARD, toastError, Terminal: FakeTerminal, FitAddon: FakeAddon, SearchAddon: FakeAddon, mapGetters: () => ({}) }
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
    findNext: text => { calls.push(['findNext', text]); return found },
    findPrevious: text => { calls.push(['findPrevious', text]); return found }
  }
  return { term, search, fit: { fit: () => calls.push('fit') }, id: 7, calls }
}

// 가짜 this: 패널의 data와, 고른 탭의 터미널 하나
function panel(entry, { text = '', fontSize = 13 } = {}) {
  const dispatched = []
  const focused = []
  const toasts = []
  const vm = {
    activeKey: 1,
    panes: { left: 1, right: null },
    fontSize,
    terms: new Map(entry ? [[1, entry]] : []),
    search: { isOpen: false, text, isMissing: false },
    $refs: { search: { focus: () => focused.push('search') } },
    $nextTick: fn => fn(),
    $store: { dispatch: (...args) => dispatched.push(args) },
    $bvToast: { toast: (body, options) => toasts.push({ body, title: options.title, variant: options.variant }) }
  }
  for (const [name, method] of Object.entries(component.methods)) vm[name] = method.bind(vm)
  return { vm, dispatched, focused, toasts }
}

afterEach(() => vi.unstubAllGlobals())

describe('the script of the terminal panel', () => {
  it('runs here without xterm.js', () => {
    expect(component.name).toBe('TerminalPanel')
    expect(imported).toContain('SearchAddon')
    expect(imported.length).toBeGreaterThan(15)
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

// 세션이 끝났을 때와 다시 접속할 때. 가짜 this에 세션 목록, 출력의 길(router), store에 한 commit의 기록을 더한다.
function ending(entry, session) {
  const { vm } = panel(entry)
  const seen = { commits: [], unregistered: [], registered: [], closed: [] }
  vm.allSessions = [session]
  vm.router = { unregister: id => seen.unregistered.push(id), register: id => seen.registered.push(id) }
  vm.$store = { commit: (...args) => seen.commits.push(args) }
  vm.closeSession = closing => seen.closed.push(closing)
  return { vm, seen }
}

describe('a session that ends', () => {
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
        close: id => calls.push(['close', id]),
        resize: (...args) => calls.push(['resize', ...args])
      }
    }
  })
  const { vm } = panel(null)
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
  return { vm, calls, closes, answer, seen, session, screen }
}

describe('opening a session', () => {
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
    const { code, handler } = made.at(-1).osc
    expect(code).toBe(CONNECTED_OSC)
    expect(handler('something else')).toBe(true)
    expect(seen.commits.some(([, patch]) => patch.connected)).toBe(false)
    expect(handler(CONNECTED_DATA)).toBe(true)
    expect(seen.commits.at(-1)).toEqual(['terminalUpdate', { key: 1, connected: true }])
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
    expect(entry.term.options.windowsPty).toBe(undefined)
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
})

describe('closing a tab', () => {
  // 가짜 this에 main에 한 요청과 store에 한 commit의 기록을 더한다. 화면을 놓아주는 것(dispose)은 터미널의 기록에 남는다.
  const closing = entry => {
    const calls = []
    vi.stubGlobal('window', { preload: { terminal: { close: id => calls.push(['close', id]) } } })
    const { vm } = panel(entry)
    const seen = { commits: [], unregistered: [] }
    vm.$store = { commit: (...args) => seen.commits.push(args) }
    vm.router = { unregister: id => seen.unregistered.push(id) }
    return { vm, calls, seen }
  }
  const screen = extra => {
    const entry = { ...terminal(), ended: false, ...extra }
    entry.term.dispose = () => entry.calls.push('dispose')
    return entry
  }

  it('ends its session, lets go of its screen and takes the tab out of the list', () => {
    const entry = screen()
    const { vm, calls, seen } = closing(entry)

    vm.closeSession({ key: 1 })
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
    const { vm, closes, answer, session } = opening()
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
