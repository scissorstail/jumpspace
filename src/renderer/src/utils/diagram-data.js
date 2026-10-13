// 에디터(Rete)가 통째로 읽을 수 있는 다이어그램 데이터인지 본다. 앱이 쓴 데이터는 언제나 그렇다; 손으로 만들거나 고친 파일의
// 데이터는 아닐 수 있고, main(storage.js의 normalizeItems)은 data가 객체이기만 하면 받아들인다.
// 읽지 못할 데이터를 Rete에 주면 조용히 틀린 것이 캔버스에 남고, 잠글 때 그것이 그 다이어그램에 저장된다:
//   - id가 다르거나 없으면 Rete는 캔버스를 비우지도 않고 거절한다. 앞서 연 다이어그램의 노드가 새 이름 아래에 남는다.
//   - 만들 수 없는 노드(모르는 종류, 위치 없음)나 없는 노드로 가는 연결이 있으면 중간에 멈춰서 일부만 남는다.
//   - 한 입력으로 들어오는 둘째 연결, 없는 소켓의 연결은 버려지는데 Rete의 fromJSON은 그래도 true를 답한다.
//   - 번호(id)가 제 자리(키)와 다른 노드는 저장할 때 다른 키로 옮겨지고, 같은 번호의 노드 둘은 하나로 합쳐진다.
// 그래서 열기 전에 본다 (main-navigator.vue의 openItem). 여기의 규칙은 Rete가 실제로 하는 일과 맞아야 한다:
// diagram-data.test.js가 진짜 Rete에 같은 데이터를 읽혀서, 통째로 읽는 것과 여기서 받아들이는 것이 같은지 본다.

// 에디터와 엔진의 id (components/editor/index.vue), 노드의 종류와 소켓 (nodes/site-node/index.js)
export const EDITOR_ID = 'test@0.1.0'
const NODE_KINDS = ['Site']
const INPUT = 'input1'
const OUTPUT = 'output1'

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
// 까닭에 넣는 노드의 번호. 손으로 쓴 파일에서는 무엇이든 될 수 있으니 길면 자른다.
const label = key => (String(key).length > 20 ? `${String(key).slice(0, 20)}...` : String(key))

// 반환: 열 수 없는 까닭 (화면에 보여줄 한 문장), 통째로 읽을 수 있으면 null.
// 까닭에는 노드의 번호만 넣는다: 데이터의 다른 글자(이름, 주소, 비밀번호)는 옮기지 않는다.
export function diagramProblem(data) {
  if (!isRecord(data) || data.id !== EDITOR_ID || !isRecord(data.nodes)) {
    return 'Its data is not a diagram of this app.'
  }

  const linked = new Set()
  for (const [key, node] of Object.entries(data.nodes)) {
    const name = label(key)
    if (!isRecord(node)) return `Node ${name} cannot be read.`
    if (!Number.isInteger(node.id) || String(node.id) !== key) return `Node ${name} is filed under a number that is not its own.`
    if (!NODE_KINDS.includes(node.name)) return `Node ${name} is of a kind this version does not know.`
    if (!Array.isArray(node.position)) return `Node ${name} has no position.`
    if (!isRecord(node.data)) return `Node ${name} has no settings.`
    if (!isRecord(node.outputs)) return `The links of node ${name} cannot be read.`

    for (const [socket, output] of Object.entries(node.outputs)) {
      if (!isRecord(output) || !Array.isArray(output.connections)) return `The links of node ${name} cannot be read.`

      for (const link of output.connections) {
        if (!isRecord(link) || !Object.hasOwn(data.nodes, String(link.node))) return `A link of node ${name} leads to a node that is not there.`
        if (socket !== OUTPUT || link.input !== INPUT) return `A link of node ${name} uses a socket that a node does not have.`
        // 노드의 입력은 연결 하나만 받는다
        if (linked.has(String(link.node))) return `Node ${label(link.node)} has more than one link coming in.`
        linked.add(String(link.node))
      }
    }
  }

  return null
}
