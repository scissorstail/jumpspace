import Rete from 'rete'
import { describe, expect, it } from 'vitest'
import { LOOP_NAMES, closesLoop, loopIn, loopText } from './link-loop'

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

  // loopIn이 고리를 찾는 다이어그램은 엔진이 거부하는 다이어그램이고, 찾은 고리는 정말 그 연결들로 이어진 고리다
  it('agrees with loopIn about every small diagram, and the loop it names is one of those links', async () => {
    const withSelf = [...diagrams, [[1, 1]], [[1, 2], [3, 3]], [[1, 2], [2, 3], [3, 4], [4, 2]], [[1, 2], [1, 3], [3, 4], [4, 1]], [[2, 1], [3, 2], [4, 3], [1, 4]]]
    let loops = 0

    for (const links of withSelf) {
      const loop = loopIn(links)
      expect({ links, hasLoop: loop !== null }).toEqual({ links, hasLoop: await engineRefuses(links) })
      if (!loop) continue

      loops++
      expect(new Set(loop).size).toBe(loop.length)
      loop.forEach((node, index) => {
        const after = loop[(index + 1) % loop.length]
        expect({ links, link: [node, after], isThere: links.some(([a, b]) => a === node && b === after) }).toEqual({ links, link: [node, after], isThere: true })
      })
    }

    expect(loops).toBeGreaterThan(50)
    expect(withSelf.length - loops).toBeGreaterThan(200)
  }, 30000)
})

describe('the loop in the links of a diagram', () => {
  it.each([
    { name: 'no links', links: [], loop: null },
    { name: 'a path', links: [['a', 'b'], ['b', 'c']], loop: null },
    { name: 'branches that meet again (no way back)', links: [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']], loop: null },
    { name: 'two nodes linked both ways', links: [['a', 'b'], ['b', 'a']], loop: ['a', 'b'] },
    { name: 'a node linked to itself', links: [['a', 'b'], ['b', 'b']], loop: ['b'] },
    { name: 'a circle of three', links: [['a', 'b'], ['b', 'c'], ['c', 'a']], loop: ['a', 'b', 'c'] },
    { name: 'a path that leads into a circle (the path is not part of it)', links: [['x', 'a'], ['a', 'b'], ['b', 'c'], ['c', 'a']], loop: ['a', 'b', 'c'] },
    { name: 'a circle behind a dead end', links: [['a', 'x'], ['a', 'b'], ['b', 'c'], ['c', 'b']], loop: ['b', 'c'] },
    { name: 'a circle in a second group of nodes', links: [['a', 'b'], ['c', 'd'], ['d', 'e'], ['e', 'c']], loop: ['c', 'd', 'e'] },
    { name: 'a circle reached through a node that was looked at before', links: [['a', 'b'], ['c', 'b'], ['c', 'd'], ['d', 'c']], loop: ['c', 'd'] }
  ])('$name', ({ links, loop }) => {
    expect(loopIn(links)).toEqual(loop)
  })

  it('tells the numbers of nodes apart as they are, and leaves the list of links as it was', () => {
    const links = [[1, 2], [2, 11], [11, 1]]

    expect(loopIn(links)).toEqual([1, 2, 11])
    expect(links).toEqual([[1, 2], [2, 11], [11, 1]])
  })

  // 앞의 길을 다 보고 난 노드가 연결 목록에서 고리보다 먼저 와도, 그 뒤의 고리까지 찾는다
  it('goes on past a node it has already looked at to a loop after it', () => {
    expect(loopIn([[1, 2], [2, 5], [3, 4], [4, 3]])).toEqual([3, 4])
  })

  it('ends on a long path and on a long circle', () => {
    const path = Array.from({ length: 2000 }, (_, i) => [i, i + 1])

    expect(loopIn(path)).toBe(null)
    expect(loopIn([...path, [2000, 0]])).toHaveLength(2001)
  })
})

describe('the words about a loop in an opened diagram', () => {
  const REST = '\nThese links make a loop. While it is there no path can be worked out: every node of this diagram connects directly. Unlock the editor and take one of those links away.'

  it('name the nodes in the order of the links and end where they began', () => {
    expect(loopText(['bastion', 'app'])).toBe(`bastion → app → bastion${REST}`)
    expect(loopText(['app'])).toBe(`app → app${REST}`)
  })

  it('name no more than six nodes of a long loop', () => {
    expect(LOOP_NAMES).toBe(6)
    expect(loopText(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(`a → b → c → d → e → f → a${REST}`)
    expect(loopText(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBe(`a → b → c → d → e → f → ... → a${REST}`)
    expect(loopText(Array.from({ length: 500 }, (_, i) => `n${i}`))).toBe(`n0 → n1 → n2 → n3 → n4 → n5 → ... → n0${REST}`)
  })
})
