import { describe, expect, it, vi } from 'vitest'
import { activeTerminalNode, BUSY_IDLE_MS, busyNodes, canReconnect, countByOwner, createActivityWatch, createOutputRouter, duplicateNumbers, duplicateRefusal, endedByUser, forwardPorts, hopKey, INTERRUPT_WINDOW_MS, isMotionReport, numberedTitle, portsInUse, reconnectRefusal, reorderSessions, rightClickAction, routeStates, sessionPhase, sessionsOf, terminalShortcut, terminalTitle } from './terminal-sessions'

describe('terminalTitle', () => {
  it('names a tab after the node', () => {
    expect(terminalTitle('connect', { name: 'db', host: '10.0.0.5' })).toBe('db')
    expect(terminalTitle('connect', { name: '', host: '10.0.0.5' })).toBe('10.0.0.5')
    expect(terminalTitle('connect', {})).toBe('ssh')
  })

  it('marks forwards and jumps', () => {
    expect(terminalTitle('forward', { name: 'db' })).toBe('⇄ db')
    // 거치는 노드 수는 이름에 넣지 않는다 (같은 이름의 번호와 겹친다)
    expect(terminalTitle('proxyJump', { name: 'db' }, 2)).toBe('db')
    expect(terminalTitle('proxyJump', { name: 'db' })).toBe('db')
  })
})

describe('createOutputRouter', () => {
  it('sends output to the tab of its session', () => {
    const router = createOutputRouter()
    const a = vi.fn()
    const b = vi.fn()
    router.register(1, a)
    router.register(2, b)

    router.push(1, 'x')
    router.push(2, 'y')

    expect(a).toHaveBeenCalledWith('x')
    expect(b).toHaveBeenCalledWith('y')
  })

  it('keeps output that arrives before the tab knows its id, and hands it over once', () => {
    const router = createOutputRouter()
    router.push(5, 'hel')
    router.push(5, 'lo')

    const write = vi.fn()
    router.register(5, write)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('hello')

    router.push(5, '!')
    expect(write).toHaveBeenLastCalledWith('!')
  })

  it('bounds what it keeps, and forgets a closed session', () => {
    const router = createOutputRouter({ maxPending: 4 })
    router.push(1, 'abcdef')
    const write = vi.fn()
    router.register(1, write)
    expect(write).toHaveBeenCalledWith('cdef')

    router.unregister(1)
    router.push(1, 'late')
    router.push(1, 'r')
    const again = vi.fn()
    router.register(1, again)
    expect(again).toHaveBeenCalledWith('ater') // 'later'을 4자로 자른 것
    expect(write).toHaveBeenCalledTimes(1)
  })
})

describe('hopKey', () => {
  it('identifies a server by user, host and port only', () => {
    expect(hopKey({ user: 'deploy', host: 'web', port: '22', password: 'secret', keyPath: '/k' })).toBe('deploy@web:22')
    expect(hopKey({ user: ' deploy ', host: 'web', port: 22 })).toBe('deploy@web:22')
    expect(hopKey({ host: 'db.internal' })).toBe('@db.internal:')
    expect(hopKey(null)).toBe('@:')
  })
})

describe('sessions of a diagram', () => {
  const sessions = [{ key: 1, owner: 0 }, { key: 2, owner: 3 }, { key: 3, owner: 0 }, { key: 4, owner: null }]

  it('keeps only the sessions the item opened, in order', () => {
    expect(sessionsOf(sessions, 0).map(x => x.key)).toEqual([1, 3])
    expect(sessionsOf(sessions, 3).map(x => x.key)).toEqual([2])
    expect(sessionsOf(sessions, 7)).toEqual([])
    expect(sessionsOf(undefined, 0)).toEqual([])
  })

  // item 번호 0과 "열린 item 없음"(null)은 다르다.
  it('does not mix up item 0 with no item', () => {
    expect(sessionsOf(sessions, null).map(x => x.key)).toEqual([4])
  })

  it('counts the open tabs of every item', () => {
    const counts = countByOwner(sessions)

    expect(counts.get(0)).toBe(2)
    expect(counts.get(3)).toBe(1)
    expect(counts.get(7)).toBeUndefined()
    expect(countByOwner(undefined).size).toBe(0)
  })
})

describe('reorderSessions', () => {
  const sessions = [{ key: 1, owner: 0 }, { key: 2, owner: 3 }, { key: 3, owner: 0 }, { key: 4, owner: 0 }]
  const keys = list => list.map(x => x.key)

  it('puts the dragged tabs in their new order', () => {
    expect(keys(reorderSessions(sessions, [4, 1, 3]))).toEqual([4, 2, 1, 3])
  })

  // 다른 item의 세션(2)은 보이지 않는 채로 제자리에 남는다.
  it('leaves the sessions of other diagrams where they are', () => {
    const result = reorderSessions(sessions, [3, 4, 1])

    expect(keys(result)).toEqual([3, 2, 4, 1])
    expect(result[1]).toBe(sessions[1])
  })

  it('ignores keys that are unknown or repeated, and does not change the input', () => {
    expect(keys(reorderSessions(sessions, [3, 99, 3, 1]))).toEqual([3, 2, 1, 4])
    expect(keys(reorderSessions(sessions, []))).toEqual([1, 2, 3, 4])
    expect(keys(sessions)).toEqual([1, 2, 3, 4])
  })
})

describe('sessionPhase', () => {
  it('is connecting until the login marker arrived, then connected', () => {
    expect(sessionPhase({ status: 'starting' })).toBe('connecting')
    expect(sessionPhase({ status: 'running', connected: false })).toBe('connecting')
    expect(sessionPhase({ status: 'running', connected: true })).toBe('connected')
  })

  it('is failed when it could not start or ssh itself failed, and nothing after a normal end', () => {
    expect(sessionPhase({ status: 'failed' })).toBe('failed')
    expect(sessionPhase({ status: 'exited', exitCode: 255 })).toBe('failed')
    expect(sessionPhase({ status: 'exited', exitCode: 0 })).toBeNull()
    // 셸의 마지막 명령이 정한 종료 코드다 (ssh 오류가 아니다)
    expect(sessionPhase({ status: 'exited', exitCode: 1 })).toBeNull()
    expect(sessionPhase(null)).toBeNull()
  })
})

describe('routeStates', () => {
  const a = 'u@a:22'
  const b = 'u@b:22'
  const c = 'u@c:22'

  it('marks the nodes and the links along every session with its phase', () => {
    const { nodes, links } = routeStates([
      { status: 'running', connected: true, hops: [a, b, c] },
      { status: 'exited', exitCode: 255, hops: [c] }
    ])

    expect(Object.fromEntries(nodes)).toEqual({ [a]: 'connected', [b]: 'connected', [c]: 'connected' })
    expect(Object.fromEntries(links)).toEqual({ [`${a}>${b}`]: 'connected', [`${b}>${c}`]: 'connected' })
  })

  it('shows the best phase where routes share a node: connected, then connecting, then failed', () => {
    const { nodes } = routeStates([
      { status: 'exited', exitCode: 255, hops: [a, b] },
      { status: 'starting', hops: [a] },
      { status: 'failed', hops: [c] }
    ])

    expect(Object.fromEntries(nodes)).toEqual({ [a]: 'connecting', [b]: 'failed', [c]: 'failed' })
  })

  it('ignores sessions that ended normally and sessions without a route', () => {
    const { nodes, links } = routeStates([
      { status: 'exited', exitCode: 0, hops: [a, b] },
      { status: 'running', connected: true }
    ])

    expect(nodes.size).toBe(0)
    expect(links.size).toBe(0)
    expect(routeStates(undefined).links.size).toBe(0)
  })

  it('goes on past a session that ended normally to the sessions after it', () => {
    const { nodes } = routeStates([
      { status: 'exited', exitCode: 0, hops: [a] },
      { status: 'running', connected: true, hops: [b] }
    ])

    expect(Object.fromEntries(nodes)).toEqual({ [b]: 'connected' })
  })

  it('keeps the direction of a link', () => {
    const { links } = routeStates([{ status: 'running', connected: true, hops: [a, b] }])

    expect(links.has(`${a}>${b}`)).toBe(true)
    expect(links.has(`${b}>${a}`)).toBe(false)
  })
})

describe('activeTerminalNode', () => {
  const a = 'u@a:22'
  const b = 'u@b:22'
  const c = 'u@c:22'
  const sessions = [
    { key: 1, status: 'running', connected: true, hops: [a] },
    { key: 2, status: 'running', connected: true, hops: [a, b, c] },
    { key: 3, status: 'exited', exitCode: 255, hops: [a, b] }
  ]

  // Connect는 노드 하나, ProxyJump와 포워딩은 앞 노드들 다음에 그 노드가 온다.
  it('is the last hop of the selected tab: the node it was opened from', () => {
    expect(activeTerminalNode(sessions, 1)).toBe(a)
    expect(activeTerminalNode(sessions, 2)).toBe(c)
  })

  it('follows the selected tab, also when its session has ended', () => {
    expect(activeTerminalNode(sessions, 3)).toBe(b)
  })

  it('is nothing while the panel is hidden', () => {
    expect(activeTerminalNode(sessions, 2, false)).toBe(null)
    expect(activeTerminalNode(sessions, 2, true)).toBe(c)
  })

  it('is nothing without a selected tab or without a route', () => {
    expect(activeTerminalNode(sessions, null)).toBe(null)
    expect(activeTerminalNode(sessions, 9)).toBe(null)
    expect(activeTerminalNode([{ key: 1, hops: [] }, { key: 2 }], 1)).toBe(null)
    expect(activeTerminalNode([{ key: 1, hops: [] }, { key: 2 }], 2)).toBe(null)
    expect(activeTerminalNode(undefined, 1)).toBe(null)
  })
})

describe('busyNodes', () => {
  const key = name => `ops@${name}:22`

  it('is the last node of every logged-in session with output', () => {
    expect([...busyNodes([
      { status: 'running', connected: true, busy: true, hops: [key('jump'), key('app')] },
      { status: 'running', connected: true, busy: true, hops: [key('db')] }
    ])]).toEqual([key('app'), key('db')])
  })

  it('leaves out a quiet session, one that has not logged in, one that ended and one without a path', () => {
    expect([...busyNodes([
      { status: 'running', connected: true, busy: false, hops: [key('a')] },
      { status: 'running', connected: false, busy: true, hops: [key('b')] },
      { status: 'starting', busy: true, hops: [key('c')] },
      { status: 'exited', exitCode: 0, busy: true, hops: [key('d')] },
      { status: 'exited', exitCode: 255, busy: true, hops: [key('e')] },
      { status: 'failed', busy: true, hops: [key('f')] },
      { status: 'running', connected: true, busy: true, hops: [] }
    ])]).toEqual([])
    expect(busyNodes(undefined).size).toBe(0)
  })
})

describe('createActivityWatch', () => {
  // 가짜 시계와 타이머: 테스트가 시간을 앞으로 보낸다
  function watch() {
    let time = 0
    let next = 1
    const timers = new Map()
    const changes = []
    const activity = createActivityWatch((key, busy) => changes.push([key, busy]), {
      now: () => time,
      setTimer: (fn, ms) => {
        timers.set(next, { fn, at: time + ms })
        return next++
      },
      clearTimer: id => timers.delete(id)
    })
    const advance = ms => {
      const end = time + ms
      for (;;) {
        const [due] = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)
        if (!due) break
        timers.delete(due[0])
        time = due[1].at
        due[1].fn()
      }
      time = end
    }
    return { activity, changes, advance, timers }
  }

  it('waits a second', () => {
    expect(BUSY_IDLE_MS).toBe(1000)
  })

  it('says busy at the first output and quiet a second after it', () => {
    const { activity, changes, advance } = watch()

    activity.output(1)
    expect(changes).toEqual([[1, true]])
    advance(BUSY_IDLE_MS - 1)
    expect(changes).toEqual([[1, true]])
    advance(1)
    expect(changes).toEqual([[1, true], [1, false]])
  })

  it('stays busy while the output goes on, with one timer, and says so once', () => {
    const { activity, changes, advance, timers } = watch()

    for (let i = 0; i < 10; i++) {
      activity.output(1)
      expect(timers.size).toBe(1)
      advance(300)
    }
    expect(changes).toEqual([[1, true]])
    advance(BUSY_IDLE_MS - 300 - 1)
    expect(changes).toEqual([[1, true]])
    advance(1)
    expect(changes).toEqual([[1, true], [1, false]])
    expect(timers.size).toBe(0)
  })

  it('watches each session on its own, and starts again after a quiet time', () => {
    const { activity, changes, advance } = watch()

    activity.output(1)
    advance(600)
    activity.output(2)
    advance(400)
    expect(changes).toEqual([[1, true], [2, true], [1, false]])
    advance(600)
    expect(changes).toEqual([[1, true], [2, true], [1, false], [2, false]])
    activity.output(1)
    expect(changes.at(-1)).toEqual([1, true])
  })

  it('forgets a session that ended: quiet at once and its timer gone, nothing for one it does not watch', () => {
    const { activity, changes, advance, timers } = watch()

    activity.output(1)
    activity.forget(1)
    expect(changes).toEqual([[1, true], [1, false]])
    expect(timers.size).toBe(0)
    advance(BUSY_IDLE_MS * 2)
    activity.forget(2)
    expect(changes).toEqual([[1, true], [1, false]])
  })

  it('stops every timer without a word', () => {
    const { activity, changes, advance, timers } = watch()

    activity.output(1)
    activity.output(2)
    activity.stop()
    expect(timers.size).toBe(0)
    advance(BUSY_IDLE_MS * 2)
    expect(changes).toEqual([[1, true], [2, true]])
  })
})

describe('rightClickAction', () => {
  it('copies the selected text, or pastes when nothing is selected', () => {
    expect(rightClickAction({ hasSelection: true })).toBe('copy')
    expect(rightClickAction({ hasSelection: false })).toBe('paste')
    expect(rightClickAction()).toBe('paste')
    expect(rightClickAction({ mouseTracking: 'none', shiftKey: true, hasSelection: true })).toBe('copy')
  })

  it('leaves the click to a program that asked for the mouse, unless Shift is held', () => {
    for (const mouseTracking of ['x10', 'vt200', 'drag', 'any']) {
      expect(rightClickAction({ mouseTracking })).toBe('program')
      expect(rightClickAction({ mouseTracking, hasSelection: true })).toBe('program')
      expect(rightClickAction({ mouseTracking, shiftKey: true })).toBe('paste')
      expect(rightClickAction({ mouseTracking, shiftKey: true, hasSelection: true })).toBe('copy')
    }
  })
})

// #252: Windows에서 Git의 ssh가 창 크기가 바뀐 뒤 ESC를 잃으면 "[<35;10;5M"이 친 글자로 들어갔다
describe('isMotionReport', () => {
  // xterm.js의 SGR 보고 (CoreMouseService): 코드는 버튼 없음(3) + 이동(32)에 Shift 4, Alt 8, Ctrl 16을 더한 것
  it('is a move of the mouse with no button pressed, with or without Shift, Alt or Ctrl', () => {
    for (const code of [35, 39, 43, 47, 51, 55, 59, 63]) expect(isMotionReport(`\x1b[<${code};10;5M`)).toBe(true)
    expect(isMotionReport('\x1b[<35;1;1M')).toBe(true)
    expect(isMotionReport('\x1b[<35;240;61M')).toBe(true)
  })

  // 누르기와 놓기(0 - 2), 버튼을 누른 채 끌기(32 - 34), 휠(64, 65)은 프로그램이 다르게 쓰는 입력이다
  it('is not a press, a release, a drag with a button or a turn of the wheel', () => {
    for (const report of ['\x1b[<0;10;5M', '\x1b[<0;10;5m', '\x1b[<2;10;5M', '\x1b[<32;10;5M', '\x1b[<33;10;5M', '\x1b[<34;10;5M', '\x1b[<36;10;5M', '\x1b[<64;10;5M', '\x1b[<65;10;5M', '\x1b[<99;10;5M']) {
      expect(isMotionReport(report)).toBe(false)
    }
  })

  // 하나의 보고가 onData 한 번이다: 그 밖의 것은 그대로 보낸다
  it('is nothing else: a report without its ESC, typed text, two reports at once, a move that ends with m, a broken report', () => {
    for (const data of ['[<35;10;5M', 'ls\r', '\x1b[<35;10;5M\x1b[<35;11;5M', 'a\x1b[<35;10;5M', '\x1b[<35;10;5Ma', '\x1b[<35;10;5m', '\x1b[<35;10M', '\x1b[<35;;5M', '\x1b[M#!!', '', undefined]) {
      expect(isMotionReport(data)).toBe(false)
    }
  })
})

describe('terminalShortcut', () => {
  const key = (code, mods = {}, key = '') => ({ type: 'keydown', code, key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods })

  it('copies with Ctrl+Shift+C and Ctrl+Insert', () => {
    expect(terminalShortcut(key('KeyC', { ctrlKey: true, shiftKey: true }, 'C'))).toBe('copy')
    expect(terminalShortcut(key('Insert', { ctrlKey: true }, 'Insert'))).toBe('copy')
  })

  it('copies with Ctrl+C only while text is selected, so it still interrupts otherwise', () => {
    expect(terminalShortcut(key('KeyC', { ctrlKey: true }, 'c'), { hasSelection: true })).toBe('copy')
    expect(terminalShortcut(key('KeyC', { ctrlKey: true }, 'c'), { hasSelection: false })).toBe(null)
    expect(terminalShortcut(key('KeyC', { ctrlKey: true }, 'c'))).toBe(null)
  })

  it('pastes with Ctrl+V and Ctrl+Shift+V, selected text or not', () => {
    expect(terminalShortcut(key('KeyV', { ctrlKey: true }, 'v'))).toBe('paste')
    expect(terminalShortcut(key('KeyV', { ctrlKey: true, shiftKey: true }, 'V'))).toBe('paste')
    expect(terminalShortcut(key('KeyV', { ctrlKey: true }, 'v'), { hasSelection: true })).toBe('paste')
    expect(terminalShortcut(key('KeyV', {}, 'v'))).toBe(null)
    expect(terminalShortcut(key('KeyV', { ctrlKey: true, altKey: true }, 'v'))).toBe(null)
  })

  it('opens the search with Ctrl+Shift+F and leaves Ctrl+F to the program', () => {
    expect(terminalShortcut(key('KeyF', { ctrlKey: true, shiftKey: true }, 'F'))).toBe('find')
    expect(terminalShortcut(key('KeyF', { ctrlKey: true }, 'f'))).toBe(null)
    expect(terminalShortcut(key('KeyF', { shiftKey: true }, 'F'))).toBe(null)
    expect(terminalShortcut(key('KeyF', { ctrlKey: true, shiftKey: true, altKey: true }, 'F'))).toBe(null)
  })

  it('changes the font size with Ctrl and +, =, - or 0, also on the number pad', () => {
    expect(terminalShortcut(key('Equal', { ctrlKey: true }, '='))).toBe('font-up')
    expect(terminalShortcut(key('Equal', { ctrlKey: true, shiftKey: true }, '+'))).toBe('font-up')
    expect(terminalShortcut(key('NumpadAdd', { ctrlKey: true }, '+'))).toBe('font-up')
    expect(terminalShortcut(key('Minus', { ctrlKey: true }, '-'))).toBe('font-down')
    expect(terminalShortcut(key('NumpadSubtract', { ctrlKey: true }, '-'))).toBe('font-down')
    expect(terminalShortcut(key('Digit0', { ctrlKey: true }, '0'))).toBe('font-reset')
    expect(terminalShortcut(key('Numpad0', { ctrlKey: true }, '0'))).toBe('font-reset')
  })

  // Ctrl+Shift+-는 ^_ (emacs와 nano의 undo): xterm.js가 보내게 둔다.
  it('leaves Ctrl+_ to the program, and the same keys without Ctrl or with Alt', () => {
    expect(terminalShortcut(key('Minus', { ctrlKey: true, shiftKey: true }, '_'))).toBe(null)
    expect(terminalShortcut(key('Equal', {}, '='))).toBe(null)
    expect(terminalShortcut(key('Minus', {}, '-'))).toBe(null)
    expect(terminalShortcut(key('Digit0', {}, '0'))).toBe(null)
    expect(terminalShortcut(key('Equal', { ctrlKey: true, altKey: true }, '='))).toBe(null)
    expect(terminalShortcut(key('Digit1', { ctrlKey: true }, '1'))).toBe(null)
    expect(terminalShortcut({ ...key('Equal', { ctrlKey: true }, '='), type: 'keyup' })).toBe(null)
  })

  it('leaves Ctrl+C (interrupt), plain keys, other modifiers and key-up alone', () => {
    expect(terminalShortcut(key('KeyC', { ctrlKey: true }, 'c'))).toBe(null)
    expect(terminalShortcut(key('KeyC', { shiftKey: true }, 'C'))).toBe(null)
    expect(terminalShortcut(key('KeyC', { ctrlKey: true, shiftKey: true, altKey: true }, 'C'))).toBe(null)
    expect(terminalShortcut(key('Insert', { shiftKey: true }, 'Insert'))).toBe(null)
    expect(terminalShortcut({ ...key('KeyC', { ctrlKey: true, shiftKey: true }, 'C'), type: 'keyup' })).toBe(null)
    expect(terminalShortcut(undefined)).toBe(null)
  })
})

describe('canReconnect', () => {
  it('is true only for a session that ran and ended', () => {
    expect(canReconnect({ status: 'exited', id: 3 })).toBe(true)
    expect(canReconnect({ status: 'exited', id: 3, exitCode: 255 })).toBe(true)
    expect(canReconnect({ status: 'running', id: 3 })).toBe(false)
    expect(canReconnect({ status: 'starting', id: null })).toBe(false)
    expect(canReconnect({ status: 'failed', id: null })).toBe(false)
    expect(canReconnect({ status: 'exited', id: null })).toBe(false)
    expect(canReconnect(null)).toBe(false)
  })
})

// 탭을 Ctrl+클릭: main에 그 세션이 있으면 같은 접속을 하나 더 연다 (#257)
describe('duplicateRefusal', () => {
  it('is nothing for a tab whose session runs or ended, connected or not', () => {
    for (const session of [{ status: 'running', id: 3 }, { status: 'running', id: 3, connected: true }, { status: 'exited', id: 3, exitCode: 255 }, { status: 'exited', id: 0, exitCode: 0 }]) {
      expect(duplicateRefusal(session), JSON.stringify(session)).toBe(null)
    }
  })

  // 다시 접속하는 중인 탭은 옛 id를 갖고 있지만, main은 답을 줄 때까지 그 요청을 꺼내 두었다
  it('asks to wait while the tab is opening, also while it connects again with its old id', () => {
    for (const session of [{ status: 'starting', id: null }, { status: 'starting', id: 3 }]) {
      expect(duplicateRefusal(session)).toBe('This terminal is still opening. Try again once it is open.')
    }
  })

  it('sends to the node a tab that did not start, or has no session for another reason', () => {
    for (const session of [{ status: 'failed', id: null }, { status: 'exited', id: null }, { status: 'running' }, null]) {
      expect(duplicateRefusal(session), JSON.stringify(session)).toBe('This terminal did not start. Start it from its node.')
    }
  })

  // 돌고 있는 포워딩 탭은 그 로컬 포트를 쥐고 있다: 복사본의 ssh는 그 포트를 열지 못하고 곧바로 끝난다 (#258)
  it('keeps a running forwarding tab from a copy that could not forward its ports, and lets an ended one be copied', () => {
    const inUse = 'The ports this tab forwards are in use while it runs, so a second tab could not forward them. Open it again once it has ended.'
    expect(duplicateRefusal({ kind: 'forward', status: 'running', id: 3 })).toBe(inUse)
    expect(duplicateRefusal({ kind: 'forward', status: 'running', id: 3, connected: true })).toBe(inUse)
    expect(duplicateRefusal({ kind: 'forward', status: 'exited', id: 3, exitCode: 255 })).toBe(null)
    expect(duplicateRefusal({ kind: 'forward', status: 'starting', id: null })).toBe('This terminal is still opening. Try again once it is open.')
    for (const kind of ['connect', 'proxyJump']) expect(duplicateRefusal({ kind, status: 'running', id: 3 }), kind).toBe(null)
  })

  // 끝난 포워딩 탭이라도 그 포트를 다른 탭이 지금 포워딩하면 복사본은 곧바로 끝난다 (#264)
  it('keeps an ended forwarding tab from a copy while another tab forwards one of its ports', () => {
    const ended = { key: 1, kind: 'forward', ports: ['8080'], status: 'exited', id: 3, exitCode: 255 }
    const copy = { key: 2, kind: 'forward', ports: ['8080'], status: 'running', id: 4 }
    expect(duplicateRefusal(ended, [ended, copy])).toBe('Local port 8080 is forwarded by another tab now, so a new tab could not forward it. Open it again once that tab has ended.')
    expect(duplicateRefusal(ended, [ended, { ...copy, status: 'exited' }])).toBe(null)
    expect(duplicateRefusal(ended)).toBe(null)
  })
})

// 포워딩 요청의 로컬 포트 (#264): main의 validateForwards 그대로
describe('forwardPorts', () => {
  it('lists the local ports of the checked forwards, as main reads them', () => {
    expect(forwardPorts({ forwards: [{ checked: true, from: '08080', host: 'db', to: '5432' }, { checked: false, from: '9090', to: '80' }, { checked: true, from: 22, to: '22' }] })).toEqual(['8080', '22'])
  })

  it('lists none for a list main would refuse, and for no list', () => {
    for (const payload of [{ forwards: [{ checked: true, from: '0', to: '80' }] }, { forwards: [] }, { forwards: 'none' }, {}, null, undefined]) {
      expect(forwardPorts(payload), JSON.stringify(payload)).toEqual([])
    }
  })
})

// 끝난 포워딩 탭에서 Enter: 다른 탭이 그 로컬 포트를 포워딩하는 동안은 다시 접속하지 않는다 (owner, 2026-10-17, #264)
describe('reconnectRefusal', () => {
  const ended = { key: 1, kind: 'forward', ports: ['8080', '9090'], status: 'exited', id: 3, exitCode: 255 }
  const other = (status, ports = ['8080'], more = {}) => ({ key: 2, kind: 'forward', ports, status, id: 4, ...more })

  it('says which port another tab forwards now, running or still opening, also in another space', () => {
    const text = 'Local port 8080 is forwarded by another tab now, so this one could not forward it. Press Enter again once that tab has ended.'
    expect(reconnectRefusal(ended, [ended, other('running')])).toBe(text)
    expect(reconnectRefusal(ended, [ended, other('running', ['8080'], { connected: true })])).toBe(text)
    expect(reconnectRefusal(ended, [ended, other('starting', ['8080'], { id: null })])).toBe(text)
    expect(reconnectRefusal(ended, [ended, other('running', ['8080'], { owner: 5 })])).toBe(text)
    expect(portsInUse(ended, [ended, other('running')])).toEqual(['8080'])
  })

  it('names every port that is taken', () => {
    expect(reconnectRefusal(ended, [ended, other('running', ['9090', '8080', '7070'])])).toBe('Local ports 8080, 9090 are forwarded by another tab now, so this one could not forward them. Press Enter again once that tab has ended.')
  })

  it('lets it connect again when no other tab holds its ports', () => {
    for (const sessions of [[ended], [ended, other('exited')], [ended, other('failed', ['8080'], { id: null })], [ended, other('running', ['7070'])], [ended, { ...other('running'), kind: 'connect' }], [ended, { ...other('running'), kind: 'proxyJump' }], [ended, { ...ended, status: 'running' }], undefined]) {
      expect(reconnectRefusal(ended, sessions), JSON.stringify(sessions)).toBe(null)
    }
  })

  it('is nothing for a tab that forwards nothing', () => {
    expect(reconnectRefusal({ key: 1, kind: 'connect', ports: [], status: 'exited', id: 3 }, [other('running')])).toBe(null)
    expect(reconnectRefusal({ key: 1, kind: 'connect', ports: ['8080'], status: 'exited', id: 3 }, [other('running')])).toBe(null)
    expect(reconnectRefusal({ key: 1, kind: 'forward', status: 'exited', id: 3 }, [other('running')])).toBe(null)
    expect(reconnectRefusal(null, [other('running')])).toBe(null)
  })
})

describe('endedByUser', () => {
  const now = 100000

  it('closes a session the user logged out of, whatever the shell returned', () => {
    expect(endedByUser({ exitCode: 0, connected: true, now })).toBe(true)
    expect(endedByUser({ exitCode: 3, connected: true, now })).toBe(true)
  })

  it('keeps a session that ssh ended by itself (refused, auth failed, connection lost)', () => {
    expect(endedByUser({ exitCode: 255, connected: false, now })).toBe(false)
    expect(endedByUser({ exitCode: 255, connected: true, now })).toBe(false)
  })

  it('closes a forward stopped with Ctrl+C (ssh -N also returns 255), but only right after it', () => {
    expect(endedByUser({ exitCode: 255, connected: true, interruptedAt: now - 500, now })).toBe(true)
    expect(endedByUser({ exitCode: 255, connected: true, interruptedAt: now - INTERRUPT_WINDOW_MS, now })).toBe(true)
    expect(endedByUser({ exitCode: 255, connected: true, interruptedAt: now - INTERRUPT_WINDOW_MS - 1, now })).toBe(false)
  })

  it('closes a connection cancelled with Ctrl+C while connecting', () => {
    expect(endedByUser({ exitCode: 130, connected: false, now })).toBe(true)
  })

  it('keeps a session that ended before logging in, so its error stays readable', () => {
    expect(endedByUser({ exitCode: 127, connected: false, now })).toBe(false)
    expect(endedByUser({ exitCode: 0, connected: false, now })).toBe(false)
  })
})

describe('duplicateNumbers', () => {
  const session = (key, title) => ({ key, title })
  const numbers = list => [...duplicateNumbers(list)]

  it('numbers the tabs that share a name, in the order they were opened', () => {
    expect(numbers([session(1, 'web'), session(2, 'db'), session(3, 'web'), session(5, 'web')])).toEqual([[1, 1], [3, 2], [5, 3]])
  })

  it('gives a name that is there once no number', () => {
    expect(numbers([session(1, 'web'), session(2, 'db')])).toEqual([])
    expect(numbers([])).toEqual([])
    expect(numbers(undefined)).toEqual([])
  })

  // 탭을 끌어서 옮겨도 번호는 그대로다
  it('does not follow the order of the tabs', () => {
    const moved = [session(3, 'web'), session(1, 'web')]

    expect(duplicateNumbers(moved).get(1)).toBe(1)
    expect(duplicateNumbers(moved).get(3)).toBe(2)
    expect(moved.map(x => x.key)).toEqual([3, 1])
  })

  it('tells a forward and a jump of the same node apart by their own names', () => {
    expect(numbers([session(1, 'web'), session(2, '⇄ web'), session(3, 'web (+1)')])).toEqual([])
  })
})

describe('numberedTitle', () => {
  it('puts the number after the name, and leaves a name without a number as it is', () => {
    expect(numberedTitle('web', 2)).toBe('web (2)')
    expect(numberedTitle('web (+1)', 1)).toBe('web (+1) (1)')
    expect(numberedTitle('web', undefined)).toBe('web')
  })
})
