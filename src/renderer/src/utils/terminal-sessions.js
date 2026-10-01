// 앱 안의 터미널 탭에 쓰는 순수 로직

// 탭 이름: 노드 이름(없으면 host). 포워딩은 앞에 ⇄, ProxyJump는 거치는 노드 수를 붙인다.
export function terminalTitle(kind, connection, hops = 0) {
  const name = connection?.name || connection?.host || 'ssh'
  if (kind === 'forward') return `⇄ ${name}`
  if (kind === 'proxyJump' && hops > 0) return `${name} (+${hops})`
  return name
}

// 서버 하나(한 홉)를 가리키는 키. 캔버스의 노드와 열린 세션을 이 값으로 맞춰 본다.
// (비밀번호나 키 경로는 넣지 않는다. 세션 목록에 남기 때문이다)
export function hopKey(connection) {
  const text = value => String(value ?? '').trim()

  return `${text(connection?.user)}@${text(connection?.host)}:${text(connection?.port)}`
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
// 끝난 세션은 같은 탭에서 다시 접속할 수 있다. (열지도 못한 세션은 main에 요청이 없다)
export function canReconnect(session) {
  return session?.status === 'exited' && session.id !== null && session.id !== undefined
}

export function terminalShortcut(event) {
  if (event?.type !== 'keydown' || !event.ctrlKey || event.altKey || event.metaKey) return null
  if (event.shiftKey && event.code === 'KeyC') return 'copy'
  if (!event.shiftKey && event.key === 'Insert') return 'copy'
  return null
}
