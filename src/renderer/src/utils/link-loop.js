// 연결이 고리를 이루는지 본다. links는 에디터의 연결들: [앞 노드의 번호, 뒤 노드의 번호]의 목록.
// 고리가 있으면 Rete의 엔진이 다이어그램 전체의 계산을 거부한다 (Recursion detected, 콘솔에만 찍힌다). 그러면 어느 노드도
// 제 앞의 노드를 알지 못해서, 경유 경로 없이 모든 노드가 바로 접속하게 된다. 그래서 고리를 닫는 연결은 받지 않는다
// (components/editor/index.vue의 refuseLoop). link-loop.test.js가 진짜 엔진과 답이 같은지 본다.

// 노드마다 그 뒤에 이어진 노드들: 앞 노드의 번호 -> 뒤 노드들의 번호 (연결 순서대로)
function nextOf(links) {
  const next = new Map()
  for (const [before, after] of links) {
    next.set(before, [...(next.get(before) || []), after])
  }
  return next
}

// from에서 to로 가는 연결을 더하면 고리가 닫히는가: 제 자신으로 가는 연결이거나, 이미 to에서 from으로 가는 길이 있을 때.
// 이미 있는 고리는 세지 않는다 (그 고리에 닿지 않는 연결은 받는다). 고리가 있어도 끝난다: 한 번 본 노드는 다시 보지 않는다.
export function closesLoop(links, from, to) {
  if (from === to) return true

  const next = nextOf(links)
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

// 연결들 안의 고리 하나: 그 고리를 이루는 노드의 번호들을 연결 순서대로 (마지막 노드가 첫 노드로 이어진다). 없으면 null.
// 제 자신으로 가는 연결은 노드 하나짜리 고리다. 예전 버전에서 그렸거나 파일에서 온 다이어그램을 열 때 쓴다:
// 지금은 고리를 그릴 수 없지만, 그런 다이어그램은 있는 그대로 열린다.
export function loopIn(links) {
  const next = nextOf(links)

  // 깊이 우선으로 따라간다. path는 지금 따라가는 길, turns는 길 위의 노드마다 다음에 볼 연결의 차례.
  // done은 거기서 떠난 길에 고리가 없다고 이미 본 노드: 다시 따라가지 않는다.
  const done = new Set()
  for (const start of next.keys()) {
    if (done.has(start)) continue

    const path = [start]
    const turns = [0]
    while (path.length) {
      const node = path[path.length - 1]
      const afters = next.get(node) || []
      const turn = turns[turns.length - 1]++

      if (turn >= afters.length) {
        done.add(path.pop())
        turns.pop()
      } else if (path.includes(afters[turn])) {
        return path.slice(path.indexOf(afters[turn]))
      } else if (!done.has(afters[turn])) {
        path.push(afters[turn])
        turns.push(0)
      }
    }
  }

  return null
}

// 고리를 알리는 글에 넣는 이름의 수. 손으로 만든 파일의 고리는 얼마든지 길 수 있다.
export const LOOP_NAMES = 6

// 연 다이어그램에 고리가 있다고 알리는 글. names: 고리를 이루는 노드의 이름들, 연결 순서대로 (loopIn의 순서).
// 첫 이름을 끝에 한 번 더 적어서 고리임을 보인다: a → b → a. 길면 앞의 LOOP_NAMES개만 적는다.
export function loopText(names) {
  const shown = names.length > LOOP_NAMES ? [...names.slice(0, LOOP_NAMES), '...'] : names

  return `${[...shown, names[0]].join(' → ')}\nThese links make a loop. While it is there no path can be worked out: every node of this diagram connects directly. Unlock the editor and take one of those links away.`
}
