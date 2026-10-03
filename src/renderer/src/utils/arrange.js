// 노드 자동 정렬: 연결 방향(앞 노드 -> 다음 노드)을 따라 왼쪽에서 오른쪽으로 열을 만들고,
// 한 경로의 노드는 될 수 있으면 같은 줄에 놓는다. 결과는 묶음의 가운데가 (0, 0)인 좌표다.

export const ARRANGE_GAP = { x: 128, y: 48 }

// nodes: [{ id, x, y, width, height }] (x, y는 지금 위치, 같은 열 안의 순서를 정할 때 쓴다)
// links: [[fromId, toId]]
// 반환: Map(id -> [x, y]) 노드 왼쪽 위 좌표
export function arrangeLayout(nodes, links, gap = ARRANGE_GAP) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const edges = links.filter(([from, to]) => from !== to && byId.has(from) && byId.has(to))
  const preds = new Map(nodes.map(node => [node.id, []]))
  const succs = new Map(nodes.map(node => [node.id, []]))
  for (const [from, to] of edges) {
    preds.get(to).push(from)
    succs.get(from).push(to)
  }

  // 열: 가장 긴 앞 경로의 길이. 순환이 있으면 남은 노드는 이미 정해진 앞 노드 다음 열에 둔다.
  const byPosition = (a, b) => a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id))
  const rank = new Map()
  const waiting = new Map(nodes.map(node => [node.id, preds.get(node.id).length]))
  const queue = nodes.filter(node => waiting.get(node.id) === 0).map(node => node.id)
  while (queue.length) {
    const id = queue.shift()
    rank.set(id, Math.max(-1, ...preds.get(id).map(p => rank.get(p) ?? -1)) + 1)
    for (const next of succs.get(id)) {
      waiting.set(next, waiting.get(next) - 1)
      if (waiting.get(next) === 0) queue.push(next)
    }
  }
  for (const node of nodes.filter(node => !rank.has(node.id)).sort(byPosition)) {
    rank.set(node.id, Math.max(-1, ...preds.get(node.id).map(p => rank.get(p) ?? -1)) + 1)
  }

  const columns = []
  for (const node of nodes) {
    const c = rank.get(node.id)
    ;(columns[c] ||= []).push(node)
  }

  // 줄: 첫 열은 지금 위아래 순서대로, 다음 열은 앞 노드들의 평균 줄에 가깝게, 겹치면 아래로 민다.
  const row = new Map()
  for (const column of columns.filter(Boolean)) {
    const desired = node => {
      const rows = preds.get(node.id).filter(p => row.has(p)).map(p => row.get(p))
      return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : Infinity
    }
    const sorted = column.map(node => ({ node, want: desired(node) }))
      .sort((a, b) => a.want - b.want || byPosition(a.node, b.node))
    let next = 0
    for (const { node, want } of sorted) {
      const r = Number.isFinite(want) ? Math.max(Math.round(want), next) : next
      row.set(node.id, r)
      next = r + 1
    }
  }

  // 좌표: 열 너비는 그 열에서 가장 넓은 노드, 줄 높이는 가장 높은 노드에 맞춘다.
  const pitch = Math.max(...nodes.map(node => node.height)) + gap.y
  const columnX = []
  let x = 0
  columns.forEach((column, c) => {
    columnX[c] = x
    x += Math.max(0, ...(column || []).map(node => node.width)) + gap.x
  })

  const positions = new Map(nodes.map(node => [node.id, [columnX[rank.get(node.id)], row.get(node.id) * pitch]]))
  const box = boxOf(nodes.map(node => ({ ...node, x: positions.get(node.id)[0], y: positions.get(node.id)[1] })))
  const cx = (box.left + box.right) / 2
  const cy = (box.top + box.bottom) / 2
  for (const [id, [px, py]] of positions) {
    positions.set(id, [px - cx, py - cy])
  }

  return positions
}

// 노드들을 감싸는 상자 { left, top, right, bottom }
export function boxOf(nodes) {
  return {
    left: Math.min(...nodes.map(node => node.x)),
    top: Math.min(...nodes.map(node => node.y)),
    right: Math.max(...nodes.map(node => node.x + node.width)),
    bottom: Math.max(...nodes.map(node => node.y + node.height))
  }
}
