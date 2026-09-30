// 이전 버전(대상 host 칸이 없던 때)에 저장한 포워딩을 지금의 방식으로 옮긴다.
//
// 이전 버전: user/host/port가 모두 있는 노드에 포워딩이 있어도, 실제로는 "앞 노드에 접속해서 이 노드의 host:포트로" 연결했다.
// 지금: 그 노드에 접속해서 대상 host(비우면 localhost)로 연결한다. 그대로 두면 예전 항목의 의미가 바뀌므로,
//       그런 항목은 앞 노드로 옮기고 대상 host를 이 노드의 host로 채운다. (앞 노드에 접속해서 이 노드로 연결 = 예전과 같은 동작)
//
// 이전 버전의 항목에는 `host` 키가 없다. 옮긴 항목과 새로 만든 항목에는 항상 있어서 두 번 옮기는 일은 없다.

const hasHost = entry => Object.hasOwn(entry ?? {}, 'host')
const isRoutable = connection => Boolean(connection?.user && connection?.host && connection?.port)

// data: Rete가 저장한 { nodes: { id: { data: { connection }, inputs } } }. 새 객체를 돌려주고 원본은 바꾸지 않는다.
export function migrateLegacyForwards(data) {
  const nodes = structuredClone(data?.nodes || {})

  for (const node of Object.values(nodes)) {
    const connection = node?.data?.connection
    if (!connection || !Array.isArray(connection.forwards)) continue

    const legacy = connection.forwards.filter(entry => entry && !hasHost(entry))
    if (legacy.length === 0) continue

    const prevId = node.inputs?.input1?.connections?.[0]?.node
    const prev = nodes[prevId]?.data?.connection
    const movable = isRoutable(connection) && prev && Array.isArray(prev.forwards ?? [])
    const taken = new Set((prev?.forwards ?? []).map(entry => entry?.from))

    connection.forwards = connection.forwards.flatMap(entry => {
      if (!entry || hasHost(entry)) return [entry]

      // 앞 노드에 같은 로컬 포트가 이미 있으면 옮길 수 없다. 이 노드에 남기고(대상 host는 localhost) 그대로 둔다.
      if (movable && !taken.has(entry.from)) {
        taken.add(entry.from)
        prev.forwards = [...(prev.forwards ?? []), { ...entry, host: connection.host }]
        return []
      }

      return [{ ...entry, host: null }]
    })
  }

  return { ...data, nodes }
}
