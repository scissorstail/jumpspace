import Rete from 'rete'
import { describe, expect, it } from 'vitest'
import { closesLoop } from './link-loop'

describe('whether a new link would close a loop', () => {
  // a -> b -> c, d apart
  const chain = [['a', 'b'], ['b', 'c']]

  it.each([
    { name: 'a link from a node to itself', links: [], from: 'a', to: 'a', answer: true },
    { name: 'a link from a node to itself, among other links', links: chain, from: 'd', to: 'd', answer: true },
    { name: 'a link back to the node before', links: chain, from: 'b', to: 'a', answer: true },
    { name: 'a link from the end of a path back to its start', links: chain, from: 'c', to: 'a', answer: true },
    { name: 'a link back into the middle of a path', links: chain, from: 'c', to: 'b', answer: true },
    { name: 'the first link of a diagram', links: [], from: 'a', to: 'b', answer: false },
    { name: 'a link on to a new node', links: chain, from: 'c', to: 'd', answer: false },
    { name: 'a link from a new node to the start of a path', links: chain, from: 'd', to: 'a', answer: false },
    { name: 'a second way to a node further on (no way back)', links: chain, from: 'a', to: 'c', answer: false },
    { name: 'a link between two branches of one node', links: [['a', 'b'], ['a', 'c']], from: 'b', to: 'c', answer: false },
    { name: 'a link between two paths', links: [['a', 'b'], ['c', 'd']], from: 'b', to: 'c', answer: false },
    { name: 'the link that joins two paths into a circle', links: [['a', 'b'], ['b', 'c'], ['c', 'd']], from: 'd', to: 'a', answer: true },
    { name: 'a way back that goes through a branch', links: [['a', 'b'], ['a', 'c'], ['c', 'd']], from: 'd', to: 'a', answer: true },
    { name: 'a way back that is found after a dead end', links: [['a', 'b'], ['a', 'c'], ['b', 'x'], ['c', 'd']], from: 'd', to: 'a', answer: true }
  ])('$name: $answer', ({ links, from, to, answer }) => {
    expect(closesLoop(links, from, to)).toBe(answer)
  })

  it('tells the numbers of nodes apart as they are (Rete numbers its nodes)', () => {
    expect(closesLoop([[1, 2], [2, 3]], 3, 1)).toBe(true)
    expect(closesLoop([[1, 2], [2, 3]], 3, 4)).toBe(false)
    expect(closesLoop([[1, 2], [2, 3]], 11, 1)).toBe(false)
  })

  // 파일에서 온 다이어그램에는 이미 고리가 있을 수 있다. 그 고리를 따라 끝없이 돌지 않고, 새 연결이 닫는 고리만 본다.
  it('ends in a diagram that already has a loop, and counts only the loop the new link would close', () => {
    const loop = [['x', 'y'], ['y', 'x'], ['a', 'b']]

    expect(closesLoop(loop, 'a', 'x')).toBe(false)
    expect(closesLoop(loop, 'x', 'a')).toBe(false)
    expect(closesLoop(loop, 'b', 'a')).toBe(true)
    expect(closesLoop(loop, 'y', 'x')).toBe(true)
    expect(closesLoop([['x', 'y'], ['y', 'z'], ['z', 'y']], 'a', 'x')).toBe(false)
  })

  it('leaves the list of links as it was', () => {
    const links = [['a', 'b'], ['b', 'c']]

    closesLoop(links, 'c', 'a')
    expect(links).toEqual([['a', 'b'], ['b', 'c']])
  })
})

// Rete의 엔진은 고리가 있는 다이어그램을 통째로 거부한다 (Recursion detected). closesLoop가 받는 연결은 엔진이 계산하는
// 다이어그램을 남기고, 받지 않는 연결은 엔진이 거부할 다이어그램을 만드는 것이어야 한다. 노드 넷, 연결 셋까지의 모든
// 다이어그램에 모든 연결을 하나씩 더해 보며 진짜 엔진과 견준다.
describe('what the real engine of Rete says about the same links', () => {
  const IDS = [1, 2, 3, 4]
  const site = new (class extends Rete.Component {
    constructor() { super('Site') }
    worker() {}
  })()
  const dataOf = links => ({
    id: 'test@0.1.0',
    nodes: Object.fromEntries(IDS.map(id => [id, {
      id,
      name: 'Site',
      data: {},
      position: [0, 0],
      inputs: { input1: { connections: links.filter(([, to]) => to === id).map(([from]) => ({ node: from, output: 'output1', data: {} })) } },
      outputs: { output1: { connections: links.filter(([from]) => from === id).map(([, to]) => ({ node: to, input: 'input1', data: {} })) } }
    }]))
  })
  async function engineRefuses(links) {
    const said = []
    const engine = new Rete.Engine('test@0.1.0')
    // 엔진은 오류를 콘솔에 찍는다. 여기서는 받아 적기만 한다.
    engine.events.error = []
    engine.events.warn = []
    engine.on('error', ({ message }) => said.push(message))
    engine.register(site)
    const answer = await engine.process(dataOf(links))
    // 엔진은 고리를 process가 답한 뒤에 알린다 (검사를 기다리지 않고 계산으로 넘어가서, 계산은 아무 노드도 돌리지 않고 끝난다)
    await new Promise(resolve => setImmediate(resolve))
    const refused = said.includes('Recursion detected')
    // 거부한 다이어그램에는 aborted를, 계산한 다이어그램에는 success를 답한다
    expect(answer).toBe(refused ? 'aborted' : 'success')

    return refused
  }

  const pairs = IDS.flatMap(from => IDS.map(to => [from, to]))
  const plain = pairs.filter(([from, to]) => from !== to)
  // 연결 셋까지의 모든 다이어그램 (같은 연결을 두 번 넣지 않는다)
  const diagrams = [[]]
  for (let i = 0; i < plain.length; i++) {
    diagrams.push([plain[i]])
    for (let j = i + 1; j < plain.length; j++) {
      diagrams.push([plain[i], plain[j]])
      for (let k = j + 1; k < plain.length; k++) diagrams.push([plain[i], plain[j], plain[k]])
    }
  }

  it('refuses a diagram with a loop and takes one without', async () => {
    expect(await engineRefuses([[1, 2], [2, 3]])).toBe(false)
    expect(await engineRefuses([[1, 2], [2, 1]])).toBe(true)
    expect(await engineRefuses([[1, 1]])).toBe(true)
    expect(await engineRefuses([[1, 2], [2, 3], [3, 1]])).toBe(true)
  })

  it('agrees with closesLoop about every link added to every small diagram without a loop', async () => {
    let compared = 0
    let closing = 0
    const differing = []

    for (const links of diagrams) {
      if (await engineRefuses(links)) continue

      for (const [from, to] of pairs) {
        if (links.some(([a, b]) => a === from && b === to)) continue

        const refused = await engineRefuses([...links, [from, to]])
        if (closesLoop(links, from, to) !== refused) differing.push({ links, from, to, refused })
        compared++
        if (refused) closing++
      }
    }

    expect(differing).toEqual([])
    // 견준 것이 있고, 두 답이 모두 넉넉히 나왔다
    expect(diagrams).toHaveLength(1 + 12 + 66 + 220)
    expect(compared).toBeGreaterThan(3000)
    expect(closing).toBeGreaterThan(1000)
    expect(compared - closing).toBeGreaterThan(1000)
  }, 30000)
})
