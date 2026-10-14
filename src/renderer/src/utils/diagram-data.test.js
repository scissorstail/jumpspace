import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Rete from 'rete'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { EDITOR_ID, diagramProblem } from './diagram-data'
import { emptyItemData } from './navigator-items'

const here = dirname(fileURLToPath(import.meta.url))
const read = file => readFileSync(join(here, file), 'utf8').replace(/\r\n/g, '\n')

// 앱이 쓰는 모양의 노드와 연결 (Rete의 toJSON)
const node = (id, more = {}) => ({
  id,
  name: 'Site',
  data: { connection: { name: `node ${id}`, host: `10.0.0.${id}`, port: '22' } },
  inputs: { input1: { connections: [] } },
  outputs: { output1: { connections: [] } },
  position: [80 * id, 40],
  ...more
})
const linkTo = (...ids) => ({ output1: { connections: ids.map(id => ({ node: id, input: 'input1', data: {} })) } })
// 포워딩 목록이 그런 노드의 설정
const settings = forwards => ({ connection: { name: 'app', user: 'ops', host: '10.0.0.5', port: '22', forwards } })
const diagram = (...nodes) => ({ id: EDITOR_ID, nodes: Object.fromEntries(nodes.map(x => [x.id, x])) })
const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([name]) => name !== key))

const NOT_A_DIAGRAM = 'Its data is not a diagram of this app.'

// problem: diagramProblem이 답할 말 (null이면 받아들인다).
// strict: Rete는 통째로 읽지만 앱이 그 노드로 일하지 못해서 받아들이지 않는 것 (까닭을 적는다).
const cases = [
  // 앱이 쓰는 것, 그리고 Rete가 통째로 읽는 조금 다른 것
  { name: 'a new, empty diagram', data: emptyItemData(), problem: null },
  { name: 'two nodes and a link, as the app writes them', data: diagram(node(7, { outputs: linkTo(8) }), node(8, { inputs: { input1: { connections: [{ node: 7, output: 'output1', data: {} }] } } })), problem: null },
  { name: 'one node leading to two', data: diagram(node(7, { outputs: linkTo(8, 9) }), node(8), node(9)), problem: null },
  { name: 'a loop (the app lets one be drawn)', data: diagram(node(7, { outputs: linkTo(8) }), node(8, { outputs: linkTo(7) })), problem: null },
  { name: 'a node linked to itself', data: diagram(node(7, { outputs: linkTo(7) }), node(8)), problem: null },
  { name: 'a node without the settings of a connection', data: diagram(node(7, { data: {} })), problem: null },
  { name: 'a position without numbers', data: diagram(node(7, { position: [null, null], outputs: linkTo(8) }), node(8)), problem: null },
  { name: 'nodes without their list of inputs', data: diagram(without(node(7, { outputs: linkTo(8) }), 'inputs'), without(node(8), 'inputs')), problem: null },
  { name: 'an output the node does not have, with no link', data: diagram(node(7, { outputs: { ...linkTo(8), output9: { connections: [] } } }), node(8)), problem: null },
  { name: 'a link without data, to a node named in quotes', data: diagram(node(7, { outputs: { output1: { connections: [{ node: '8', input: 'input1' }] } } }), node(8)), problem: null },
  { name: 'more than the editor reads (a time stamp, a comment)', data: { ...diagram(node(7)), timestamp: 1, comments: [] }, problem: null },
  { name: 'forwards as the app writes them, as an older version wrote them (no target host), and none', data: diagram(node(7, { data: settings([{ checked: true, from: '8080', host: 'localhost', to: '80' }, { checked: false, from: '9000', host: null, to: '9001' }]) }), node(8, { data: settings([{ checked: true, from: '5432', to: '5432' }]) }), node(9, { data: settings(null) })), problem: null },
  { name: 'forwards with entries that are no forwards, and with ports as numbers', data: diagram(node(7, { data: settings([5, 'x', null, [], { checked: 1, from: 8080, host: '', to: 80 }]) }), node(8, { data: settings(0) })), problem: null },

  // Rete가 거절하고 캔버스를 그대로 둔다
  { name: 'no data at all', data: null, problem: NOT_A_DIAGRAM },
  { name: 'a list', data: [], problem: NOT_A_DIAGRAM },
  { name: 'a text', data: 'test@0.1.0', problem: NOT_A_DIAGRAM },
  { name: 'no id', data: without(diagram(node(7)), 'id'), problem: NOT_A_DIAGRAM },
  { name: 'the id of another editor', data: { ...diagram(node(7)), id: 'other@1.0.0' }, problem: NOT_A_DIAGRAM },
  { name: 'an id that is no text', data: { ...diagram(node(7)), id: 5 }, problem: NOT_A_DIAGRAM },
  { name: 'no nodes', data: { id: EDITOR_ID }, problem: NOT_A_DIAGRAM },
  { name: 'nodes that are null', data: { id: EDITOR_ID, nodes: null }, problem: NOT_A_DIAGRAM },
  { name: 'nodes as a list', data: { id: EDITOR_ID, nodes: [node(0)] }, problem: NOT_A_DIAGRAM },

  // Rete가 읽다가 멈춘다: 일부만 남는다
  { name: 'a node that is null', data: { id: EDITOR_ID, nodes: { 7: node(7), 8: null } }, problem: 'Node 8 cannot be read.' },
  { name: 'a node that is a text', data: { id: EDITOR_ID, nodes: { 7: node(7), 8: 'Site' } }, problem: 'Node 8 cannot be read.' },
  { name: 'a node of an unknown kind', data: diagram(node(7), node(8, { name: 'Other' })), problem: 'Node 8 is of a kind this version does not know.' },
  { name: 'a node without a kind', data: diagram(node(7), without(node(8), 'name')), problem: 'Node 8 is of a kind this version does not know.' },
  { name: 'a node without a position', data: diagram(node(7), without(node(8), 'position')), problem: 'Node 8 has no position.' },
  { name: 'a position that is no list', data: diagram(node(7), node(8, { position: { x: 1, y: 2 } })), problem: 'Node 8 has no position.' },
  { name: 'a node without outputs', data: diagram(without(node(7), 'outputs'), node(8)), problem: 'The links of node 7 cannot be read.' },
  { name: 'outputs that are null', data: diagram(node(7, { outputs: null }), node(8)), problem: 'The links of node 7 cannot be read.' },
  { name: 'an output that is null', data: diagram(node(7, { outputs: { output1: null } }), node(8)), problem: 'The links of node 7 cannot be read.' },
  { name: 'an output without a list of links', data: diagram(node(7, { outputs: { output1: {} } }), node(8)), problem: 'The links of node 7 cannot be read.' },
  { name: 'an unknown output without a list of links', data: diagram(node(7, { outputs: { ...linkTo(8), output9: {} } }), node(8)), problem: 'The links of node 7 cannot be read.' },
  { name: 'a link to a node that is not there', data: diagram(node(7, { outputs: linkTo(99) }), node(8)), problem: 'A link of node 7 leads to a node that is not there.' },
  { name: 'a link to something every object has', data: diagram(node(7, { outputs: linkTo('constructor') }), node(8)), problem: 'A link of node 7 leads to a node that is not there.' },
  { name: 'a link that is null', data: diagram(node(7, { outputs: { output1: { connections: [null] } } }), node(8)), problem: 'A link of node 7 leads to a node that is not there.' },

  // Rete가 true를 답하면서 잃는다
  { name: 'a link into an input a node does not have', data: diagram(node(7, { outputs: { output1: { connections: [{ node: 8, input: 'input2', data: {} }] } } }), node(8)), problem: 'A link of node 7 uses a socket that a node does not have.' },
  { name: 'a link from an output a node does not have', data: diagram(node(7, { outputs: { output2: { connections: [{ node: 8, input: 'input1', data: {} }] } } }), node(8)), problem: 'A link of node 7 uses a socket that a node does not have.' },
  { name: 'two links into one node', data: diagram(node(7, { outputs: linkTo(9) }), node(8, { outputs: linkTo(9) }), node(9)), problem: 'Node 9 has more than one link coming in.' },
  { name: 'the same link twice', data: diagram(node(7, { outputs: linkTo(8, 8) }), node(8)), problem: 'Node 8 has more than one link coming in.' },
  { name: 'a node filed under another number', data: { id: EDITOR_ID, nodes: { 5: node(7, { outputs: linkTo(6) }), 6: node(8) } }, problem: 'Node 5 is filed under a number that is not its own.' },
  { name: 'two nodes with one number', data: { id: EDITOR_ID, nodes: { 7: node(7), 8: node(7) } }, problem: 'Node 8 is filed under a number that is not its own.' },
  { name: 'a node without a number', data: { id: EDITOR_ID, nodes: { 7: without(node(7), 'id'), 8: node(8) } }, problem: 'Node 7 is filed under a number that is not its own.' },

  // Rete는 통째로 읽지만 받아들이지 않는다
  { name: 'a node with a word as its number', data: { id: EDITOR_ID, nodes: { seven: node('seven') } }, problem: 'Node seven is filed under a number that is not its own.', strict: 'Rete loses count of the numbers, and the next new node may get one that is taken' },
  { name: 'a node with its number in quotes', data: { id: EDITOR_ID, nodes: { 7: node('7', { outputs: linkTo(8) }), 8: node(8) } }, problem: 'Node 7 is filed under a number that is not its own.', strict: 'the app writes whole numbers, and Rete counts on from the highest one' },
  { name: 'a node without data', data: diagram(without(node(7, { outputs: linkTo(8) }), 'data'), node(8)), problem: 'Node 7 has no settings.', strict: 'the node cannot read or save its settings (its control throws)' },
  { name: 'a node with a list as data', data: diagram(node(7, { data: [] }), node(8)), problem: 'Node 7 has no settings.', strict: 'the settings of a node are saved under a name' },
  { name: 'forwards that are no list', data: diagram(node(7, { outputs: linkTo(8), data: settings({ 0: { checked: true, from: '8080', host: 'localhost', to: '80' } }) }), node(8)), problem: 'The forwards of node 7 cannot be read.', strict: 'the node reads its forwards as a list: its control throws, the node is drawn empty and the calculation of the paths stops there' },
  { name: 'forwards that are a word', data: diagram(node(7), node(8, { data: settings('none') })), problem: 'The forwards of node 8 cannot be read.', strict: 'the same' },
  { name: 'a forward with a number as its target host', data: diagram(node(7, { data: settings([{ checked: true, from: '8080', host: 'localhost', to: '80' }, { checked: false, from: '8081', host: 5, to: '81' }]) }), node(8)), problem: 'The forwards of node 7 cannot be read.', strict: 'the node works with the target host as text: it is drawn empty when that forward is checked, and its forwards cannot be started' },
  { name: 'a forward with a list as its target host', data: diagram(node(7, { data: settings([{ checked: true, from: '8080', host: ['localhost'], to: '80' }]) })), problem: 'The forwards of node 7 cannot be read.', strict: 'the same' }
]

describe('whether the editor can read the data of a diagram', () => {
  it.each(cases)('$name', ({ data, problem }) => {
    expect(diagramProblem(data)).toBe(problem)
  })

  it('has a case for each kind of answer', () => {
    expect(cases.filter(x => x.problem === null).length).toBeGreaterThan(8)
    expect(new Set(cases.filter(x => x.problem !== null).map(x => x.problem.replace(/\d+|seven/g, 'N'))).size).toBe(11)
  })

  it('does not repeat a long word of the file in its answer', () => {
    const word = 'x'.repeat(200)

    expect(diagramProblem({ id: EDITOR_ID, nodes: { [word]: null } })).toBe(`Node ${'x'.repeat(20)}... cannot be read.`)
    expect(diagramProblem({ id: EDITOR_ID, nodes: { 7: node(7, { outputs: linkTo(word) }), [word]: node(8) } }).length).toBeLessThan(100)
  })

  it('cuts only a word longer than 20 characters', () => {
    const word = 'x'.repeat(20)

    expect(diagramProblem({ id: EDITOR_ID, nodes: { [word]: null } })).toBe(`Node ${word} cannot be read.`)
  })

  it('knows the id of the editor, the kind of its nodes and their sockets', () => {
    const editor = read('../components/editor/index.vue')
    const site = read('../components/editor/nodes/site-node/index.js')

    expect(emptyItemData().id).toBe(EDITOR_ID)
    expect(editor).toContain(`new Rete.NodeEditor(\n      '${EDITOR_ID}',`)
    expect(editor).toContain(`new Rete.Engine('${EDITOR_ID}')`)
    expect(site).toContain("super('Site')")
    expect(site).toContain("new Rete.Input('input1', '', ConnectionSocket, false)")
    expect(site).toContain("new Rete.Output('output1', '', ConnectionSocket, true)")
  })
})

// 진짜 Rete에 같은 데이터를 읽힌다. 화면은 흉내만 낸다: Rete는 요소에 style을 주고, 듣고, 붙이는 것 말고는 하지 않는다.
// 노드는 site-node와 같은 이름, 같은 소켓의 대역이다 (진짜는 .vue를 불러와서 여기서 쓸 수 없다; 위의 테스트가 이름을 맞춰 본다).
const element = () => ({
  style: {},
  addEventListener() {},
  removeEventListener() {},
  appendChild() {},
  removeChild() {},
  parentElement: { clientWidth: 1000, clientHeight: 800 },
  offsetLeft: 0,
  offsetTop: 0,
  offsetWidth: 0,
  offsetHeight: 0
})
const socket = new Rete.Socket('')
class SiteStandIn extends Rete.Component {
  constructor() {
    super('Site')
  }

  builder(node) {
    node.addInput(new Rete.Input('input1', '', socket, false)).addOutput(new Rete.Output('output1', '', socket, true))
  }

  worker() {}
}

// 앞서 열려 있던 다이어그램 (노드 1 -> 2) 위에 data를 읽힌다. 반환: Rete의 답과 그 뒤에 에디터가 가진 것
const BEFORE = diagram(node(1, { outputs: linkTo(2) }), node(2))
async function readWithRete(data) {
  const editor = new Rete.NodeEditor(EDITOR_ID, element())
  // Rete는 경고와 오류를 콘솔에 쓴다. 여기서는 모아 둔다.
  const said = []
  editor.events.warn = [message => said.push(String(message?.message ?? message))]
  editor.events.error = [message => said.push(String(message?.message ?? message))]
  editor.register(new SiteStandIn())
  // 화면(vue-render-plugin)이 하는 일: 노드를 그릴 때 소켓을 알린다. 연결선은 소켓의 자리를 묻는다.
  editor.on('rendernode', ({ node: drawn, bindSocket }) => {
    drawn.inputs.forEach(input => bindSocket(element(), 'input', input))
    drawn.outputs.forEach(output => bindSocket(element(), 'output', output))
  })
  await editor.fromJSON(structuredClone(BEFORE))

  let answer
  try {
    answer = await editor.fromJSON(structuredClone(data))
  } catch (e) {
    answer = e
  }
  // 읽다가 멈춘 Rete는 만들던 노드를 조금 뒤에 마저 더한다
  await new Promise(resolve => setTimeout(resolve))

  return { answer, held: editor.toJSON(), said }
}
// 노드의 키와 연결만 견준다
const shape = data => ({
  nodes: Object.keys(data.nodes).sort(),
  links: Object.entries(data.nodes).flatMap(([key, x]) => Object.entries(x.outputs).flatMap(([name, output]) => output.connections.map(link => `${key}.${name} > ${link.node}.${link.input}`))).sort()
})
const isWhole = (data, { answer, held }) => answer === true && JSON.stringify(shape(held)) === JSON.stringify(shape(data))

describe('what the real Rete does with the same data', () => {
  beforeAll(() => {
    vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} })
    vi.stubGlobal('document', { createElement: element })
  })
  afterAll(() => vi.unstubAllGlobals())

  it.each(cases.filter(x => x.problem === null))('reads whole: $name', async ({ data }) => {
    expect(isWhole(data, await readWithRete(data))).toBe(true)
  })

  it.each(cases.filter(x => x.problem !== null && !x.strict))('does not read whole: $name', async ({ data }) => {
    expect(isWhole(data, await readWithRete(data))).toBe(false)
  })

  it.each(cases.filter(x => x.strict))('reads whole, but the app cannot work with it: $name ($strict)', async ({ data }) => {
    expect(isWhole(data, await readWithRete(data))).toBe(true)
  })

  // 받아들이지 않는 까닭 셋을 하나씩 보인다
  it('refuses data with another id and keeps the diagram that was open before', async () => {
    const { answer, held, said } = await readWithRete({ ...diagram(node(7)), id: 'other@1.0.0' })

    expect(answer).toBe(false)
    expect(shape(held)).toEqual(shape(BEFORE))
    expect(said).toEqual(["IDs not equal. Names don't match. Versions don't match"])
  })

  it('throws on data without an id, and keeps the diagram that was open before', async () => {
    const { answer, held } = await readWithRete(without(diagram(node(7)), 'id'))

    expect(answer).toBeInstanceOf(TypeError)
    expect(shape(held)).toEqual(shape(BEFORE))
  })

  it('stops at a node it cannot make and leaves a part of the diagram', async () => {
    const { answer, held, said } = await readWithRete(diagram(node(7, { outputs: linkTo(8) }), node(8), node(9, { name: 'Other' })))

    expect(answer).toBe(false)
    expect(shape(held).links).toEqual([])
    expect(shape(held).nodes).not.toContain('9')
    expect(said).toEqual(['Component Other not found'])
  })

  it('drops a second link into one input and still answers true', async () => {
    const { answer, held, said } = await readWithRete(diagram(node(7, { outputs: linkTo(9) }), node(8, { outputs: linkTo(9) }), node(9)))

    expect(answer).toBe(true)
    expect(shape(held)).toEqual({ nodes: ['7', '8', '9'], links: ['7.output1 > 9.input1'] })
    expect(said).toEqual(['Input already has one connection'])
  })

  it('saves two nodes with one number as one, and still answers true', async () => {
    const { answer, held } = await readWithRete({ id: EDITOR_ID, nodes: { 7: node(7), 8: node(7) } })

    expect(answer).toBe(true)
    expect(shape(held).nodes).toEqual(['7'])
  })
})
