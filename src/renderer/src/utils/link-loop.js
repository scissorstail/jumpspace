// 연결이 고리를 이루는지 본다. links는 에디터의 연결들: [앞 노드의 번호, 뒤 노드의 번호]의 목록.
// 고리가 있으면 Rete의 엔진이 다이어그램 전체의 계산을 거부한다 (Recursion detected, 콘솔에만 찍힌다). 그러면 어느 노드도
// 제 앞의 노드를 알지 못해서, 경유 경로 없이 모든 노드가 바로 접속하게 된다. 그래서 고리를 닫는 연결은 받지 않는다
// (components/editor/index.vue의 refuseLoop). link-loop.test.js가 진짜 엔진과 답이 같은지 본다.

// from에서 to로 가는 연결을 더하면 고리가 닫히는가: 제 자신으로 가는 연결이거나, 이미 to에서 from으로 가는 길이 있을 때.
// 이미 있는 고리는 세지 않는다 (그 고리에 닿지 않는 연결은 받는다). 고리가 있어도 끝난다: 한 번 본 노드는 다시 보지 않는다.
export function closesLoop(links, from, to) {
  if (from === to) return true

  const next = new Map()
  for (const [before, after] of links) {
    next.set(before, [...(next.get(before) || []), after])
  }

  const seen = new Set([to])
  const todo = [to]
  while (todo.length) {
    for (const node of next.get(todo.pop()) || []) {
      if (node === from) return true

      if (!seen.has(node)) {
        seen.add(node)
        todo.push(node)
      }
    }
  }

  return false
}
