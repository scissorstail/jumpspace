// 앱 안의 터미널 탭에 쓰는 순수 로직

// 탭 이름: 노드 이름(없으면 host). 포워딩은 앞에 ⇄, ProxyJump는 거치는 노드 수를 붙인다.
export function terminalTitle(kind, connection, hops = 0) {
  const name = connection?.name || connection?.host || 'ssh'
  if (kind === 'forward') return `⇄ ${name}`
  if (kind === 'proxyJump' && hops > 0) return `${name} (+${hops})`
  return name
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
