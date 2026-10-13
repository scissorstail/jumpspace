import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import pick from 'lodash/pick'
import { describe, expect, it } from 'vitest'
import { errorBox } from '../../../../../../utils/notify'
import { terminalTitle } from '../../../../../../utils/terminal-sessions'
import { maskText } from '../../../../../../utils/mask'
import { configRequest, forwardEntries, forwardHint, forwardPlan, forwardSummary, isRoutable, normalizeForward } from '../../../../../../utils/forward'

// 노드 하나(component.vue: 그림, 이름, 접속 정보, 위의 단추들). DOM 없이 도는 테스트라서 .vue를 불러올 수 없다: <script>의 내용을 꺼내
// import만 바꿔서 돌리고, created와 methods를 가짜 this로 부른다 (connection-settings.test.js와 같은 방법). utils는 진짜다.
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'component.vue'), 'utf8').replace(/\r\n/g, '\n')
const script = source.match(/<script>\n([\s\S]*?)<\/script>/)[1]
const imported = [...script.matchAll(/^import (?:\{([^}]+)\}|(\w+)) from .*$/gm)].flatMap(match => (match[1] ?? match[2]).split(',').map(name => name.trim()))

// 가짜 store: 설정과 노드 그림 목록
const store = { getters: { setting: { hideNodeInfo: false, openIn: 'app' }, diagram: ['server.svg', 'router.svg'] } }
const given = {
  pick,
  store,
  errorBox,
  terminalTitle,
  maskText,
  configRequest,
  forwardEntries,
  forwardHint,
  forwardPlan,
  forwardSummary,
  isRoutable,
  normalizeForward,
  ConnectionSettings: {},
  ForwardMenu: {}
}
const body = script.replace(/^import [\s\S]*? from .*\n/gm, '').replace('import.meta.env.BASE_URL', "'/base/'").replace('export default', 'return')
const component = runInThisContext(`(function (${imported.join(', ')}) {\n${body}\n})`)(...imported.map(name => given[name]))

// 노드 하나를 만든다. data: Rete 노드의 data (설정은 그 안의 connection에 있다). 가짜 this는 Vue처럼 data의 값을 제 것으로 읽고 쓴다.
// created까지 부른다: Rete가 노드를 그릴 때 일어나는 일이다. 계산(worker)은 부르지 않는다.
function nodeOf(data = {}, { ikey = 'connection' } = {}) {
  const saved = []
  const vm = {
    ikey,
    readonly: false,
    emitter: {},
    getData: key => data[key],
    putData: (key, value) => { saved.push([key, value]); data[key] = value },
    $store: store
  }
  vm.$data = component.data.call(vm)
  for (const key of Object.keys(vm.$data)) Object.defineProperty(vm, key, { get: () => vm.$data[key], set: value => { vm.$data[key] = value }, enumerable: true })
  for (const [name, get] of Object.entries(component.computed)) Object.defineProperty(vm, name, { get: () => get.call(vm) })
  for (const [name, method] of Object.entries(component.methods)) vm[name] = method.bind(vm)
  component.created.call(vm)

  return { vm, data, saved }
}

const bastion = () => ({
  name: 'bastion',
  user: 'ops',
  host: '10.0.0.1',
  port: '22',
  keyPath: 'C:/keys/id_ed25519',
  password: 'made-up',
  exec: 'htop',
  diagram: 'server.svg',
  forwards: [{ checked: true, from: '8080', host: 'localhost', to: '80' }]
})
const FIELDS = ['name', 'user', 'host', 'port', 'keyPath', 'password', 'exec', 'diagram', 'forwards']

describe('the node component', () => {
  it('runs the script of the component', () => {
    expect(imported).toEqual(Object.keys(given))
    expect(Object.keys(component.methods)).toEqual(['applyConnectionFields', 'connectionOf', 'run', 'launch', 'routeToHere', 'connect', 'openForward', 'proxyJump', 'copyConfig', 'update', 'save'])
  })
})

describe('the values of a node', () => {
  it('are read when the node is drawn, without a run of the engine', () => {
    const { vm } = nodeOf({ connection: bastion() })

    expect(pick(vm, FIELDS)).toEqual(bastion())
    expect(vm.prevNodeDataList).toEqual([])
    expect(vm.diagramFilenames).toEqual(['server.svg', 'router.svg'])
  })

  // 연결이 고리를 이루면 Rete의 엔진은 계산을 거부해서 worker가 update()를 부르지 않는다. 그때에도 잠그면 save()는 불린다
  // (Layout의 compileEditor): 읽은 적 없는 빈 칸이 노드의 값 위에 저장됐다.
  it('are saved as they were read when the engine never ran', () => {
    const { vm, data, saved } = nodeOf({ connection: bastion() })

    vm.save()

    expect(saved).toEqual([['connection', bastion()]])
    expect(data.connection).toEqual(bastion())
  })

  it('are empty for a new node, and saved so', () => {
    const { vm, saved } = nodeOf({})

    expect(pick(vm, FIELDS)).toEqual({ name: null, user: null, host: null, port: null, keyPath: null, password: null, exec: null, diagram: null, forwards: [] })

    vm.save()

    expect(saved).toEqual([['connection', { name: null, user: null, host: null, port: null, keyPath: null, password: null, exec: null, diagram: null, forwards: [] }]])
  })

  it('take only what a node has a place for', () => {
    const { vm } = nodeOf({ connection: { name: 'app', somethingElse: 'x' } })

    expect(vm.name).toBe('app')
    expect('somethingElse' in vm).toBe(false)
    expect('somethingElse' in vm.$data).toBe(false)
  })

  it('give a forward from an old file the fields it lacks', () => {
    const { vm } = nodeOf({ connection: { name: 'app', forwards: [{ checked: 1, from: '5432', to: '5432' }] } })

    expect(vm.forwards).toEqual([{ checked: true, from: '5432', host: null, to: '5432' }])
  })

  it('have no forwards when the saved list is no list', () => {
    const { vm } = nodeOf({ connection: { name: 'app', forwards: null } })

    expect(vm.forwards).toEqual([])
  })
})

describe('a run of the engine', () => {
  it('adds the nodes before this one and reads the values of the node again', () => {
    const { vm, data } = nodeOf({ connection: bastion() })
    const before = [{ name: 'gate', user: 'ops', host: '10.0.0.9', port: '22' }]
    // 설정 창을 닫으면 칸의 값이 노드에 저장된다 (save). 그 뒤의 계산은 저장된 값을 읽는다.
    data.connection = { ...bastion(), host: '10.0.0.7' }

    vm.update(before)

    expect(vm.prevNodeDataList).toBe(before)
    expect(vm.host).toBe('10.0.0.7')
    expect(vm.name).toBe('bastion')
  })

  it('without nodes before this one leaves an empty path', () => {
    const { vm } = nodeOf({ connection: bastion() })
    vm.update([{ name: 'gate' }])

    vm.update()

    expect(vm.prevNodeDataList).toEqual([])
  })
})

describe('saving a node', () => {
  it('writes what the settings and the forward list hold', () => {
    const { vm, saved } = nodeOf({ connection: bastion() })

    vm.applyConnectionFields({ ...vm.connectionFields, host: '10.0.0.8', diagram: 'router.svg' })
    vm.forwards = [...vm.forwards, { checked: false, from: '9000', host: null, to: '9000' }]
    vm.save()

    expect(saved).toEqual([['connection', {
      ...bastion(),
      host: '10.0.0.8',
      diagram: 'router.svg',
      forwards: [{ checked: true, from: '8080', host: 'localhost', to: '80' }, { checked: false, from: '9000', host: null, to: '9000' }]
    }]])
  })

  // 앞 노드들의 접속 정보(비밀번호까지)는 계산해서 얻는 값이다: 저장 파일에 중복으로 남기지 않는다
  it('never writes the nodes before this one, nor anything else of the screen', () => {
    const { vm, saved } = nodeOf({ connection: bastion() })
    vm.update([{ name: 'gate', user: 'ops', host: '10.0.0.9', port: '22', password: 'made-up-too' }])
    vm.isLocked = true
    vm.isCopied = true

    vm.save()

    expect(Object.keys(saved[0][1])).toEqual(FIELDS)
    expect(JSON.stringify(saved)).not.toContain('made-up-too')
  })

  it('does nothing for a control without a key', () => {
    const { vm, saved } = nodeOf({ connection: bastion() }, { ikey: '' })

    vm.save()

    expect(saved).toEqual([])
  })
})
