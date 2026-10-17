// 앱 안의 터미널 탭에 쓰는 순수 로직

// 탭 이름: 노드 이름(없으면 host). 포워딩은 앞에 ⇄를 붙인다. 거치는 노드 수는 이름에 넣지 않는다 (owner, 2026-10-12):
// 이름이 같은 탭의 번호와 겹쳐 'app (+1) (2)'가 되었다. 툴팁이 말한다 (utils/terminal-view.js의 sessionRouteText).
export function terminalTitle(kind, connection) {
  const name = connection?.name || connection?.host || 'ssh'
  if (kind === 'forward') return `⇄ ${name}`
  return name
}

// 이름이 같은 탭들을 구분하는 번호: Map(key -> 번호). 연 순서대로 1, 2, ... 이고, 끌어서 순서를 바꿔도 그대로다.
// 이름이 하나뿐인 탭은 들어 있지 않다 (번호를 보이지 않는다). 하나만 남으면 그 탭의 번호도 사라진다.
export function duplicateNumbers(sessions) {
  const byTitle = new Map()
  for (const session of [...(sessions || [])].sort((a, b) => a.key - b.key)) {
    byTitle.set(session.title, [...(byTitle.get(session.title) || []), session.key])
  }

  const numbers = new Map()
  for (const keys of byTitle.values()) {
    if (keys.length > 1) keys.forEach((key, i) => numbers.set(key, i + 1))
  }
  return numbers
}

// 탭을 가리키는 이름 (툴팁, 닫기 단추): 번호가 있으면 뒤에 붙인다.
export function numberedTitle(title, number) {
  return number ? `${title} (${number})` : title
}

// 패널을 좌우로 나눴을 때 두 칸에 보이는 탭 (owner, 2026-10-12). 칸마다 제 탭 줄이 있다 (owner, 2026-10-17:
// "터미널 나누기 했을 때 터미널 탭도 같이 옮겨가면 좋겠네요"): 탭은 왼쪽 칸이나 오른쪽 칸의 것이다.
//   activeKey: 고른 탭 (키 입력을 받는 칸의 탭)
//   sideKey  : 다른 칸에 함께 보이는 탭. null이면 나누지 않았다.
//   rightKeys: 오른쪽 칸의 탭들 (나머지는 왼쪽 칸의 것이다). 나누지 않았으면 비어 있다.
// 칸마다 보이는 탭은 그 칸의 탭 가운데 하나다. 돌려주는 값: { left, right } (나누지 않았으면 right는 null이고 left가 고른 탭이다)
export function shownPanes({ activeKey = null, sideKey = null, rightKeys = [] } = {}) {
  if (sideKey === null || activeKey === null) return { left: activeKey, right: null }

  return rightKeys.includes(activeKey) ? { left: sideKey, right: activeKey } : { left: activeKey, right: sideKey }
}

// 탭을 골랐다. 탭은 제 칸에 보인다: 같은 칸의 탭이면 그 칸의 탭을 바꾸고, 다른 칸의 탭이면 그 칸으로 옮겨 가서
// 그 칸의 탭을 바꾼다 (지금까지 고른 탭은 제 칸에 남는다).
export function activatePane({ activeKey, sideKey, rightKeys = [] }, key) {
  if (sideKey === null || rightKeys.includes(key) === rightKeys.includes(activeKey)) return { activeKey: key, sideKey, rightKeys }

  return { activeKey: key, sideKey: activeKey, rightKeys }
}

// 칸 하나의 탭들 (keys: 지금 item의 탭, 탭 줄의 순서)
function sideKeys(keys, rightKeys, isRight) {
  return keys.filter(x => rightKeys.includes(x) === isRight)
}

// key의 칸에서 key를 뺀 탭들과, key가 있던 자리의 이웃 (key 다음 탭, 없으면 앞의 탭, 남은 탭이 없으면 null)
function withoutKey(keys, rightKeys, key) {
  const own = sideKeys(keys, rightKeys, rightKeys.includes(key))
  const rest = own.filter(x => x !== key)

  return { rest, neighbor: rest[Math.min(own.indexOf(key), rest.length - 1)] ?? null }
}

// 탭을 닫았다. keys는 닫기 전의 지금 item의 탭들이다 (탭 줄의 순서).
// 보이던 탭이면 같은 칸의 이웃 탭이 그 자리에 보인다. 칸에 탭이 더 없으면 나누기가 끝나고 다른 칸의 탭이 패널을 다 쓴다.
// 나누지 않았으면 고른 탭을 닫을 때 옆 탭을 고른다 (탭이 더 없으면 null). 보이지 않던 탭이면 그대로다.
export function closePane({ activeKey, sideKey, rightKeys = [] }, key, keys = []) {
  const { rest, neighbor } = withoutKey(keys, rightKeys, key)
  if (sideKey === null) return { activeKey: key === activeKey ? neighbor : activeKey, sideKey: null, rightKeys: [] }
  if (rest.length === 0) return { activeKey: key === activeKey ? sideKey : activeKey, sideKey: null, rightKeys: [] }

  return { activeKey: key === activeKey ? neighbor : activeKey, sideKey: key === sideKey ? neighbor : sideKey, rightKeys: rightKeys.filter(x => x !== key) }
}

// 탭을 다른 칸의 탭 줄로 끌어 옮겼다 (side: 'left' | 'right'). keys는 옮기기 전의 지금 item의 탭들이다.
// 옮긴 탭이 그 칸에 보이고 키 입력을 받는다. 떠난 칸에는 그 칸의 탭이 그대로 보이고, 옮긴 탭이 거기 보이던 것이면 이웃이 보인다.
// 떠난 칸에 탭이 더 없으면 나누기가 끝난다 (탭은 모두 한 줄로 돌아가고, 옮긴 탭을 고른다).
export function moveToSide(state, key, side, keys = []) {
  const { activeKey, sideKey, rightKeys = [] } = state
  const toRight = side === 'right'
  if (sideKey === null || !keys.includes(key) || rightKeys.includes(key) === toRight) return { activeKey, sideKey, rightKeys }

  const { rest, neighbor } = withoutKey(keys, rightKeys, key)
  if (rest.length === 0) return { activeKey: key, sideKey: null, rightKeys: [] }

  const stays = shownPanes(state)[toRight ? 'left' : 'right']
  return { activeKey: key, sideKey: stays === key ? neighbor : stays, rightKeys: toRight ? [...rightKeys, key] : rightKeys.filter(x => x !== key) }
}

// 다른 item에서 돌아왔다: 그 item에서 떠날 때의 칸들을 되살린다. keys는 지금 남은 그 item의 탭들이다 (떠나 있는 동안 끝난
// 세션의 탭은 닫혔다). 두 칸에 탭이 하나씩은 남아 있어야 나눈 채로 돌아온다. 칸에 보이던 탭이 닫혔으면 그 칸의 첫 탭이 보인다.
// last: 떠날 때의 { activeKey, sideKey, rightKeys } (처음 여는 item이면 없다)
export function restorePanes(last, keys = []) {
  const activeKey = keys.includes(last?.activeKey) ? last.activeKey : keys[0] ?? null
  const rightKeys = last?.sideKey == null ? [] : (last.rightKeys || []).filter(x => keys.includes(x))
  const wasRight = rightKeys.length > 0 && (last.rightKeys || []).includes(last.activeKey)
  const own = sideKeys(keys, rightKeys, wasRight)
  const other = sideKeys(keys, rightKeys, !wasRight)
  if (rightKeys.length === 0 || other.length === 0 || own.length === 0) return { activeKey, sideKey: null, rightKeys: [] }

  return { activeKey: own.includes(last.activeKey) ? last.activeKey : own[0], sideKey: other.includes(last.sideKey) ? last.sideKey : other[0], rightKeys }
}

// 탭 줄 하나를 끌어서 바꾼 뒤의 탭들(newKeys)이 무엇인지: 줄 안에서 순서만 바뀌었으면 { type: 'reorder', keys },
// 다른 줄의 탭이 들어왔으면 { type: 'move', key, keys }, 탭이 이 줄을 떠났으면 null (그것은 들어간 줄이 알린다).
// rowKeys는 바꾸기 전의 그 줄의 탭들이다.
export function tabRowChange(rowKeys, newKeys) {
  const added = newKeys.filter(x => !rowKeys.includes(x))
  if (newKeys.length < rowKeys.length || added.length > 1) return null
  if (added.length === 1) return { type: 'move', key: added[0], keys: newKeys }

  return { type: 'reorder', keys: newKeys }
}

// 나누기를 켤 때 오른쪽 칸으로 옮겨 갈 탭: 고른 탭의 다음 탭, 없으면 앞의 탭. 탭이 하나뿐이면 null (나눌 수 없다).
// 다른 탭은 모두 왼쪽 칸에 남는다.
export function splitPartner(sessions, activeKey) {
  const keys = (sessions || []).map(x => x.key)
  const index = keys.indexOf(activeKey)
  if (index < 0 || keys.length < 2) return null

  return keys[index + 1] ?? keys[index - 1]
}

// 서버 하나(한 홉)를 가리키는 키. 캔버스의 노드와 열린 세션을 이 값으로 맞춰 본다.
// (비밀번호나 키 경로는 넣지 않는다. 세션 목록에 남기 때문이다)
export function hopKey(connection) {
  const text = value => String(value ?? '').trim()

  return `${text(connection?.user)}@${text(connection?.host)}:${text(connection?.port)}`
}

// 한 다이어그램(item)이 연 세션들. owner는 세션을 열 때 열려 있던 item의 번호이다.
export function sessionsOf(sessions, owner) {
  return (sessions || []).filter(x => x.owner === owner)
}

// item마다 떠 있는 터미널 탭 수: Map(owner -> 개수). 목록의 이름 옆에 보여준다.
export function countByOwner(sessions) {
  const counts = new Map()
  for (const { owner } of sessions || []) counts.set(owner, (counts.get(owner) || 0) + 1)
  return counts
}

// 탭을 끌어서 순서를 바꿨다. keys는 한 item의 탭들을 새 순서로 적은 것이다.
// 그 탭들이 차지하던 자리만 새 순서로 채우고, 다른 item의 세션은 제자리에 둔다. (목록에 없는 key는 무시한다)
export function reorderSessions(sessions, keys) {
  const byKey = new Map(sessions.map(x => [x.key, x]))
  const moved = keys.filter((key, i) => byKey.has(key) && keys.indexOf(key) === i).map(key => byKey.get(key))
  const slots = new Set(moved)
  let next = 0

  return sessions.map(x => slots.has(x) ? moved[next++] : x)
}

// 세션 하나가 캔버스에 보이는 상태
//   connecting: 시작했지만 아직 로그인 표시(ssh의 LocalCommand, shared/terminal-marker.js)가 오지 않았다
//   connected : 로그인했고 세션이 열려 있다
//   failed    : 시작하지 못했거나 ssh 자체의 오류(255)로 끝났다. 탭을 닫거나 다시 연결할 때까지 남는다.
//   null      : 정상으로 끝났다 (표시하지 않는다)
export function sessionPhase(session) {
  switch (session?.status) {
    case 'starting':
      return 'connecting'
    case 'running':
      return session.connected ? 'connected' : 'connecting'
    case 'failed':
      return 'failed'
    case 'exited':
      return session.exitCode === 255 ? 'failed' : null
    default:
      return null
  }
}

// 같은 노드를 여러 세션이 지나가면 더 좋은 상태를 보여준다.
const PHASE_RANK = { failed: 1, connecting: 2, connected: 3 }

// 세션들이 지나가는 노드와 연결선의 상태. 연결선은 'from>to' 키로 준다.
//   sessions: [{ status, connected, exitCode, hops: [hopKey, ...] }] (hops는 경로 순서: 첫 홉 -> 마지막 노드)
//   돌려주는 값: { nodes: Map(hopKey -> phase), links: Map('from>to' -> phase) }
export function routeStates(sessions) {
  const nodes = new Map()
  const links = new Map()
  const mark = (map, key, phase) => {
    if (!map.has(key) || PHASE_RANK[phase] > PHASE_RANK[map.get(key)]) map.set(key, phase)
  }

  for (const session of sessions || []) {
    const phase = sessionPhase(session)
    if (!phase) continue

    const hops = session.hops || []
    hops.forEach((hop, i) => {
      mark(nodes, hop, phase)
      if (i > 0) mark(links, `${hops[i - 1]}>${hop}`, phase)
    })
  }
  return { nodes, links }
}

// 고른 터미널 탭을 연 노드(hopKey). 세션이 지나가는 마지막 홉이 그 노드다: Connect는 노드 하나, ProxyJump와 포워딩은
// 앞 노드들 다음에 그 노드가 온다. 캔버스가 그 노드를 선택한 것처럼 보여준다.
// 패널을 최소화한 동안에는 고른 탭의 터미널이 보이지 않으므로 가리키는 노드도 없다(null).
export function activeTerminalNode(sessions, activeKey, isPanelOpen = true) {
  if (!isPanelOpen) return null

  const hops = (sessions || []).find(x => x.key === activeKey)?.hops || []

  return hops.length > 0 ? hops[hops.length - 1] : null
}

// 출력이 오가는 세션의 노드 (owner, 2026-10-15: "작업중에 노드에 초록색 불이 깜빡이게"): 그 초록 점이 깜박인다 (canvas.scss).
// 로그인한 세션만 본다: 연결 중의 노란 점과 실패의 빨간 점은 가만히 있다. 그 탭을 연 노드, 곧 경로의 마지막 홉만이다:
// 앞의 점프 호스트는 지나가기만 한다. 돌려주는 값: Set(hopKey)
export function busyNodes(sessions) {
  const nodes = new Set()
  for (const session of sessions || []) {
    const hops = session.hops || []
    if (session.busy && sessionPhase(session) === 'connected' && hops.length > 0) nodes.add(hops[hops.length - 1])
  }
  return nodes
}

// 마지막 출력에서 이만큼 아무것도 오지 않으면 세션은 조용하다 (깜박임이 멈춘다).
export const BUSY_IDLE_MS = 1000

// 세션마다 출력이 오는지 본다. 출력이 오면 바로 onChange(key, true), 마지막 출력에서 idleMs가 지나면 onChange(key, false).
// 바뀔 때만 알린다: 출력은 잦아서, 올 때마다 store에 쓰면 캔버스와 탭 줄이 그때마다 다시 그려진다.
// 타이머는 세션마다 하나다: 출력이 올 때마다 다시 걸지 않고, 깨어나서 남은 시간만큼 다시 잰다.
export function createActivityWatch(onChange, { idleMs = BUSY_IDLE_MS, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const watched = new Map()
  const wake = key => {
    const entry = watched.get(key)
    if (!entry) return
    const left = entry.last + idleMs - now()
    if (left > 0) {
      entry.timer = setTimer(() => wake(key), left)
      return
    }
    watched.delete(key)
    onChange(key, false)
  }

  return {
    // 세션 key의 출력이 왔다
    output(key) {
      const entry = watched.get(key)
      if (entry) {
        entry.last = now()
        return
      }
      watched.set(key, { last: now(), timer: setTimer(() => wake(key), idleMs) })
      onChange(key, true)
    },
    // 세션이 끝났거나 탭이 닫혔다: 더 기다리지 않는다
    forget(key) {
      const entry = watched.get(key)
      if (!entry) return
      clearTimer(entry.timer)
      watched.delete(key)
      onChange(key, false)
    },
    // 패널이 사라진다: 타이머를 모두 거둔다 (알리지 않는다)
    stop() {
      for (const { timer } of watched.values()) clearTimer(timer)
      watched.clear()
    }
  }
}

// main에서 오는 출력을 세션 id로 나눠 준다. id를 아직 모르는 출력(탭이 열리기 전에 온 것)은 모아 두었다가
// register(id, write)를 부를 때 한꺼번에 넘긴다.
export function createOutputRouter({ maxPending = 256 * 1024 } = {}) {
  const writers = new Map()
  const pending = new Map()

  return {
    register(id, write) {
      writers.set(id, write)
      const buffered = pending.get(id)
      if (buffered) {
        pending.delete(id)
        write(buffered)
      }
    },
    unregister(id) {
      writers.delete(id)
      pending.delete(id)
    },
    push(id, data) {
      const write = writers.get(id)
      if (write) {
        write(data)
        return
      }
      const buffered = (pending.get(id) || '') + data
      pending.set(id, buffered.length > maxPending ? buffered.slice(-maxPending) : buffered)
    }
  }
}

// 터미널에서 앱이 직접 처리하는 단축키. 붙여넣기(Ctrl+Shift+V, Shift+Insert)는 브라우저의 paste 이벤트로 이미 된다.
//   'copy': Ctrl+Shift+C, Ctrl+Insert (Ctrl+C는 원격 프로그램에 보내는 인터럽트로 남긴다)
// 사용자가 직접 끝낸 세션인지. 그렇다면 탭을 바로 닫고, 아니면(오류, 접속 실패) 다시 접속할 수 있게 남긴다.
//   255: ssh 자체가 끝났다 (접속 거부, 인증 실패, 연결 끊김). 다만 포워딩(ssh -N)은 Ctrl+C로 끝내도 255라서,
//        이 탭에서 방금(INTERRUPT_WINDOW_MS 안에) Ctrl+C를 눌렀다면 사용자가 끝낸 것으로 본다.
//   130: 접속 중에 Ctrl+C로 그만두었다.
//   그 밖: 로그인한 뒤 원격 쉘이 끝났다(exit, logout; 코드는 쉘의 것). 로그인하지 못하고 끝났으면 오류를 보이도록 남긴다.
export const INTERRUPT_WINDOW_MS = 3000

export function endedByUser({ exitCode, connected, interruptedAt = null, now = Date.now() }) {
  if (exitCode === 255) return interruptedAt !== null && now - interruptedAt <= INTERRUPT_WINDOW_MS
  if (exitCode === 130) return true
  return !!connected
}

// 끝난 세션은 같은 탭에서 다시 접속할 수 있다. (열지도 못한 세션은 main에 요청이 없다)
export function canReconnect(session) {
  return session?.status === 'exited' && session.id !== null && session.id !== undefined
}

// 탭을 Ctrl+클릭해서 같은 접속을 하나 더 열 수 없는 까닭 (열 수 있으면 null, #257). 요청은 main의 세션에 있다: 여는 중인
// 탭에는 아직 없고 (다시 접속하는 중인 탭도: main은 그 답을 줄 때까지 요청을 끝난 세션들에서 꺼내 둔다), 열지 못한 탭(failed)은
// 세션 id가 없다.
export function duplicateRefusal(session) {
  if (session?.status === 'starting') return 'This terminal is still opening. Try again once it is open.'
  if (session?.id === null || session?.id === undefined) return 'This terminal did not start. Start it from its node.'
  return null
}

// 터미널에서 오른쪽 클릭이 하는 일: 'copy'(고른 글자가 있다), 'paste', 아니면 'program'.
// 프로그램이 마우스를 받겠다고 한 동안(tmux의 mouse on, vim, Claude Code)에는 클릭이 프로그램의 것이다: 화면이 그 클릭을
// 프로그램에 보내므로, 여기서 붙여넣기까지 하면 클립보드의 글이 프로그램에 함께 들어간다. Shift를 누르면 터미널의 것이다
// (그 동안 글자를 고를 때도 Shift를 누른다).
//   mouseTracking: xterm.js의 term.modes.mouseTrackingMode ('none'이면 프로그램이 마우스를 받지 않는다)
export function rightClickAction({ mouseTracking = 'none', shiftKey = false, hasSelection = false } = {}) {
  if (mouseTracking !== 'none' && !shiftKey) return 'program'
  return hasSelection ? 'copy' : 'paste'
}

// 버튼을 누르지 않은 마우스 이동의 보고인지 (#252). xterm.js는 프로그램이 모든 이동을 달라고 한 동안(1003, tmux가 그 창의
// 프로그램을 위해 켠다) 마우스가 한 칸 넘을 때마다 하나씩 보낸다: ESC [ < 코드 ; 열 ; 줄 M, 코드는 3(버튼 없음) + 32(이동)에
// 수정 키(Shift 4, Alt 8, Ctrl 16)를 더한 것이다. 보고 하나가 onData 한 번이다.
// Windows에서 Git의 ssh는 창 크기가 바뀐 뒤 입력의 첫 바이트를 잃을 수 있고(LOOP_LOG의 Known bugs, #103), 그러면 ESC를 잃은
// 나머지가 친 글자로 들어간다 (owner, 2026-10-17: "[<35 어쩌구가 들어가는걸 막을 수 있나요?"). 이동은 가장 많이 오가는 입력이다.
// 누르기, 끌기(32 - 34)와 휠(64, 65)은 여기에 들지 않는다. 옛 인코딩(ESC [ M과 세 글자)은 xterm.js가 onBinary로 보내고,
// 패널은 그것을 듣지 않는다.
export function isMotionReport(data) {
  // eslint-disable-next-line no-control-regex
  const report = /^\x1b\[<(\d+);\d+;\d+M$/.exec(data)

  return report !== null && (Number(report[1]) & ~28) === 35
}

// 터미널에서 가로채는 단축키: 'copy', 'paste', 'find', 'font-up', 'font-down', 'font-reset', 아니면 null(터미널이 그대로 처리).
// Windows 터미널처럼 Ctrl+C는 고른 글자가 있을 때만 복사이고(없으면 실행 중인 프로그램을 중단시킨다), Ctrl+V는 붙여넣기다.
// Shift+Insert 붙여넣기는 브라우저가 처리하므로 여기서 다루지 않는다.
export function terminalShortcut(event, { hasSelection = false } = {}) {
  if (event?.type !== 'keydown' || !event.ctrlKey || event.altKey || event.metaKey) return null
  if (event.code === 'KeyC') return event.shiftKey || hasSelection ? 'copy' : null
  if (event.code === 'KeyV') return 'paste'
  if (!event.shiftKey && event.key === 'Insert') return 'copy'
  // 글꼴 크기: Ctrl +/= (크게), Ctrl - (작게), Ctrl 0 (기본값). 숫자판의 키도 같은 글자를 준다.
  // xterm.js는 이 키들에 아무것도 보내지 않는다. Ctrl+Shift+-는 글자가 '_'라서 여기에 걸리지 않고 ^_(emacs의 undo)로 간다.
  // 지나간 출력에서 찾기. Shift 없는 Ctrl+F는 프로그램의 것이다 (^F: 셸에서 한 글자 앞으로, less에서 한 쪽 아래로).
  if (event.shiftKey && event.code === 'KeyF') return 'find'
  if (event.key === '+' || event.key === '=') return 'font-up'
  if (event.key === '-') return 'font-down'
  if (event.key === '0') return 'font-reset'
  return null
}
