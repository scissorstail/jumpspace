import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import pick from 'lodash/pick'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

// 일어난 일을 차례로 적는다 (가짜 store, 가짜 preload, 알림 창이 함께 쓴다)
let log = []
// 가짜 store: 설정과 노드 그림 목록. 컴포넌트가 불러오는 store와 this.$store가 이것 하나다.
const SETTING = { hideNodeInfo: false, openIn: 'app' }
const store = {
  getters: { setting: { ...SETTING }, diagram: ['server.svg', 'router.svg'] },
  dispatch: (name, payload) => { log.push(['dispatch', name, payload]) }
}
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
    $store: store,
    $bvModal: { msgBoxOk: async (text, options) => { log.push(['box', text, options]) } }
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

beforeEach(() => {
  log = []
  store.getters.setting = { ...SETTING }
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

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

  it('takes from the settings window only what that window edits', () => {
    const { vm } = nodeOf({ connection: bastion() })

    expect(vm.connectionFields).toEqual(pick(bastion(), [...CONNECTION, 'diagram']))

    vm.applyConnectionFields({ host: '10.0.0.8', forwards: [], isLocked: true, prevNodeDataList: [gate()], somethingElse: 1 })

    expect(vm.host).toBe('10.0.0.8')
    expect(vm.forwards).toEqual(bastion().forwards)
    expect(vm.isLocked).toBe(false)
    expect(vm.prevNodeDataList).toEqual([])
    expect('somethingElse' in vm).toBe(false)
  })
})

// ssh 요청에 담는 값: 접속에 쓰는 일곱 가지뿐이다 (그림, 포워딩 목록, 화면의 상태는 넘기지 않는다)
const CONNECTION = ['name', 'user', 'host', 'port', 'keyPath', 'password', 'exec']
const sent = node => pick(node, CONNECTION)
// 앞 노드 하나: 계산(worker)이 넘겨주는 그대로, 그 노드에 저장된 값 전부다 (그림과 포워딩도 들어 있다)
const gate = () => ({ name: 'gate', user: 'ops', host: '10.0.0.9', port: '22', keyPath: null, password: 'made-up-too', exec: null, diagram: 'router.svg', forwards: [{ checked: true, from: '1', host: null, to: '2' }] })
// ssh로 들어갈 수 없는 노드(user와 port가 없다): 앞 노드에서 이 host로 포워딩만 한다
const db = () => ({ name: 'db', host: '10.0.0.5', forwards: [{ checked: true, from: '5432', host: null, to: '5432' }] })
// 이 노드 앞에 노드들이 있는 것으로 계산이 끝난 노드
function after(prevs, connection = bastion()) {
  const made = nodeOf({ connection })
  made.vm.update(prevs)
  return made
}
// 가짜 preload: 부른 것을 적고 정해 둔 답을 준다 (Error면 던진다)
function preload(answers = {}) {
  const ssh = Object.fromEntries(['connect', 'forward', 'proxyJump', 'copyConfig'].map(kind => [kind, async payload => {
    log.push([kind, payload])
    if (answers[kind] instanceof Error) throw answers[kind]
    return answers[kind] ?? { ok: true }
  }]))
  vi.stubGlobal('window', { preload: { ssh } })
}
const hide = () => { store.getters.setting = { ...SETTING, hideNodeInfo: true } }
const BOX = { bodyClass: 'msg-pre-line', autoFocusButton: 'ok' }

describe('whether a node can be connected to', () => {
  it.each([
    ['user, host and port, nothing before it', bastion(), [], true, false, false],
    ['no user', { ...bastion(), user: '' }, [], false, false, false],
    ['no host', { ...bastion(), host: null }, [], false, false, false],
    ['no port', { ...bastion(), port: '' }, [], false, false, false],
    ['a path of nodes that all have the three', bastion(), [gate(), gate()], true, true, true],
    ['a path with one node that lacks its port', bastion(), [gate(), { ...gate(), port: null }], true, false, false],
    ['a path with one node that lacks its user', bastion(), [{ ...gate(), user: null }, gate()], true, false, false],
    ['a whole path, but no user of its own', { ...bastion(), user: null }, [gate()], false, true, false]
  ])('%s', (name, connection, prevs, connectable, chained, jump) => {
    const { vm } = after(prevs, connection)

    expect([vm.isConnectable, vm.isChained, vm.isProxyJumpReady]).toEqual([connectable, chained, jump])
  })

  it('counts a node that was never worked out as one without nodes before it', () => {
    const { vm } = nodeOf({ connection: bastion() })
    vm.prevNodeDataList = null

    expect(vm.isChained).toBe(false)
    expect(vm.routeToHere()).toEqual([sent(bastion())])
  })
})

describe('what a node shows', () => {
  it('takes its pictures from the folder of the server pictures', () => {
    expect(nodeOf({}).vm.diagramBase).toBe('/base/img/diagram/servers/')
  })

  it('shows user, host and port, and nothing for a value that is not filled in', () => {
    expect(nodeOf({ connection: bastion() }).vm.infoText).toEqual({ user: 'ops', host: '10.0.0.1', port: '22' })
    expect(nodeOf({}).vm.infoText).toEqual({ user: '', host: '', port: '' })
  })

  it('masks them while the details are hidden, part by part, and leaves an empty one empty', () => {
    hide()

    expect(nodeOf({}).vm.isInfoHidden).toBe(true)
    expect(nodeOf({ connection: bastion() }).vm.infoText).toEqual({ user: '***', host: '***.***.***.***', port: '***' })
    expect(nodeOf({}).vm.infoText).toEqual({ user: '', host: '', port: '' })
  })

  it.each([
    ['its name', bastion(), [], false, 'Connect to bastion'],
    ['its host when it has no name', { ...bastion(), name: '' }, [], false, 'Connect to 10.0.0.1'],
    ['no address while the details are hidden', { ...bastion(), name: '' }, [], true, 'Connect to this node'],
    ['its name also while the details are hidden', bastion(), [], true, 'Connect to bastion'],
    ['neither name nor host', { user: 'ops', port: '22' }, [], false, 'Connect to this node'],
    ['the path it goes through', bastion(), [gate()], false, 'Connect to bastion through the previous nodes (ProxyJump)'],
    ['no path when a node before it cannot be connected to', bastion(), [{ name: 'gate' }], false, 'Connect to bastion']
  ])('names the connect button after %s', (name, connection, prevs, hidden, label) => {
    if (hidden) hide()

    expect(after(prevs, connection).vm.connectLabel).toBe(label)
  })

  it('plans forwards through itself when it can be connected to, with the nodes before it', () => {
    const { vm } = after([gate()])

    expect(vm.forwardPlan).toEqual({ mode: 'self', via: [gate(), sent(bastion())], defaultHost: 'localhost', reason: null })
    expect(vm.forwardHint).toBe('Opens tunnels through ops@10.0.0.1, via 1 previous node.')
    expect(nodeOf({ connection: bastion() }).vm.forwardHint).toBe('Opens tunnels through ops@10.0.0.1.')
  })

  it('plans forwards to its host from the node before it when it has no login of its own', () => {
    const { vm } = after([gate()], db())

    expect(vm.forwardPlan).toEqual({ mode: 'target', via: [gate()], defaultHost: '10.0.0.5', reason: null })
    expect(vm.forwardHint).toBe('This node has no SSH login (no user/port), so tunnels open to 10.0.0.5 through 1 previous node.')
  })

  it('plans none and says why when it cannot open any', () => {
    const { vm } = nodeOf({})

    expect(vm.forwardPlan).toEqual({ mode: null, via: [], defaultHost: 'localhost', reason: 'Enter a user, host and port to forward through this node.' })
    expect(vm.forwardHint).toBe('Enter a user, host and port to forward through this node.')
  })

  it('sums its checked forwards up under the node: the first one, and how many more', () => {
    const { vm } = nodeOf({ connection: bastion() })

    expect(vm.forwardSummaryText).toEqual({ first: ':8080 → localhost:80', more: '', text: ':8080 → localhost:80', title: ':8080 → localhost:80' })

    vm.forwards = [...vm.forwards, { checked: false, from: '1', host: null, to: '2' }, { checked: true, from: '9000', host: ' ', to: null }]

    expect(vm.forwardSummaryText).toEqual({ first: ':8080 → localhost:80', more: '+1', text: ':8080 → localhost:80 (+1)', title: ':8080 → localhost:80\n:9000 → localhost:?' })

    vm.forwards = vm.forwards.map(x => ({ ...x, checked: false }))

    expect(vm.forwardSummaryText).toBeNull()
  })

  it('sums a forward without a target host up with the host the plan gives it, and masks all of it while hidden', () => {
    const { vm } = after([gate()], db())

    expect(vm.forwardSummaryText.first).toBe(':5432 → 10.0.0.5:5432')

    hide()

    expect(vm.forwardSummaryText).toEqual({ first: ':*** → ***.***.***.***:***', more: '', text: ':*** → ***.***.***.***:***', title: ':*** → ***.***.***.***:***' })
  })
})

describe('starting ssh from a node', () => {
  it('sends only the seven values ssh is started with', () => {
    const { vm } = after([gate()])
    vm.isLocked = true

    expect(vm.connectionOf(vm.$data)).toEqual(sent(bastion()))
    expect(Object.keys(vm.connectionOf(vm.$data))).toEqual(CONNECTION)
    // 앞 노드들도 그 일곱 가지만: 그림과 포워딩 목록은 떼고 보낸다
    expect(vm.routeToHere()).toEqual([sent(gate()), sent(bastion())])
  })

  it('opens a terminal tab in the app: the request, the nodes the session goes through, the name of the tab', () => {
    const { vm } = after([gate()])

    expect(vm.launch('forward', { via: [] }, ['a', 'b'])).toBeUndefined()

    expect(log).toEqual([['dispatch', 'terminalOpen', { kind: 'forward', payload: { via: [] }, route: ['a', 'b'], title: '⇄ bastion' }]])
  })

  it('names the tab after the host when the node has no name', () => {
    const { vm } = nodeOf({ connection: { ...bastion(), name: null } })

    vm.launch('connect', {}, [])

    expect(log[0][2].title).toBe('10.0.0.1')
  })

  it('asks main for a Git Bash window instead when the setting says so, and opens no tab', async () => {
    store.getters.setting = { ...SETTING, openIn: 'window' }
    preload()
    const { vm } = nodeOf({ connection: bastion() })

    await vm.launch('proxyJump', [1, 2], [])

    expect(log).toEqual([['proxyJump', [1, 2]]])
  })

  it('shows why when main could not start ssh, without the words Electron puts in front', async () => {
    store.getters.setting = { ...SETTING, openIn: 'window' }
    preload({ connect: { ok: false, error: "Error invoking remote method 'ssh:connect': Error: Git Bash was not found.\nCheck the path in Settings." } })
    const { vm } = nodeOf({ connection: bastion() })

    await vm.connect()

    expect(log).toEqual([['connect', sent(bastion())], ['box', 'Git Bash was not found.\nCheck the path in Settings.', { title: 'Failed to start SSH', ...BOX }]])
  })

  it('shows a request that throws as well, and keeps the error for the console', async () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { vm } = nodeOf({ connection: bastion() })
    const failure = new Error('the window is gone')

    await vm.run(async () => { throw failure })

    expect(said).toHaveBeenCalledWith(failure)
    expect(log).toEqual([['box', 'the window is gone', { title: 'Failed to start SSH', ...BOX }]])
  })

  it('says nothing when ssh was started', async () => {
    const { vm } = nodeOf({ connection: bastion() })

    await vm.run(async () => ({ ok: true }))

    expect(log).toEqual([])
  })

  // 단추는 경로가 준비되면 proxyJump()를 부른다. connect()는 앞에 노드가 있어도 이 노드로 바로 간다.
  it('connects to the node directly: the session goes through this node only', () => {
    const { vm } = after([gate()])

    vm.connect()

    expect(log).toEqual([['dispatch', 'terminalOpen', { kind: 'connect', payload: sent(bastion()), route: [sent(bastion())], title: 'bastion' }]])
  })

  it('connects through the nodes before it with ProxyJump: the whole path is the request and the route', () => {
    const { vm } = after([gate()])

    vm.proxyJump()

    const path = [sent(gate()), sent(bastion())]
    expect(log).toEqual([['dispatch', 'terminalOpen', { kind: 'proxyJump', payload: path, route: path, title: 'bastion' }]])
  })
})

describe('opening the forwards of a node', () => {
  it('logs in to the node through the nodes before it; a forward without a target host goes to the node itself', () => {
    const { vm } = after([gate()])
    vm.forwards = [...vm.forwards, { checked: false, from: '9000', host: ' ', to: '9001' }]

    vm.openForward()

    expect(log).toEqual([['dispatch', 'terminalOpen', {
      kind: 'forward',
      payload: {
        via: [sent(gate()), sent(bastion())],
        forwards: [{ checked: true, from: '8080', host: 'localhost', to: '80' }, { checked: false, from: '9000', host: 'localhost', to: '9001' }]
      },
      route: [sent(gate()), sent(bastion())],
      title: '⇄ bastion'
    }]])
  })

  it('logs in to the node before it when this one has no login, and forwards to the host of this one', () => {
    const { vm } = after([gate()], db())

    vm.openForward()

    const here = { name: 'db', user: null, host: '10.0.0.5', port: null, keyPath: null, password: null, exec: null }
    expect(log).toEqual([['dispatch', 'terminalOpen', {
      kind: 'forward',
      payload: { via: [sent(gate())], forwards: [{ checked: true, from: '5432', host: '10.0.0.5', to: '5432' }] },
      // 터널은 이 노드의 host까지 간다: 캔버스는 이 노드까지의 선을 표시한다
      route: [sent(gate()), here],
      title: '⇄ db'
    }]])
  })

  it('does nothing when no forward can be opened', () => {
    const { vm } = nodeOf({ connection: { name: 'app', forwards: bastion().forwards } })

    expect(vm.openForward()).toBeUndefined()

    expect(log).toEqual([])
  })
})

describe('copying the SSH config of a node', () => {
  it('asks main for the whole path with the checked forwards on the last node', async () => {
    preload()
    const { vm } = after([gate()])
    vm.forwards = [...vm.forwards, { checked: false, from: '9000', host: null, to: '9001' }, { checked: true, from: '7000', host: '', to: '7001' }]

    await vm.copyConfig()

    expect(log).toEqual([['copyConfig', {
      nodes: [sent(gate()), sent(bastion())],
      forwards: [{ checked: true, from: '8080', host: 'localhost', to: '80' }, { checked: true, from: '7000', host: 'localhost', to: '7001' }]
    }]])
  })

  it('stops at the node before this one when this one has no login, with the forwards to its host', async () => {
    preload()
    const { vm } = after([gate()], db())

    await vm.copyConfig()

    expect(log).toEqual([['copyConfig', { nodes: [sent(gate())], forwards: [{ checked: true, from: '5432', host: '10.0.0.5', to: '5432' }] }]])
  })

  it('asks for the path without forwards when none can be opened; main says what is missing', async () => {
    preload({ copyConfig: { ok: false, error: 'node 1: host is required' } })
    const { vm } = after([{ name: 'gate' }])

    await vm.copyConfig()

    expect(log).toEqual([
      ['copyConfig', { nodes: [{ name: 'gate' }, sent(bastion())], forwards: [] }],
      ['box', 'node 1: host is required', { title: 'Failed to copy', ...BOX }]
    ])
    expect(vm.isCopied).toBe(false)
  })

  it('marks the button as copied for a second and a half', async () => {
    vi.useFakeTimers()
    preload()
    const { vm } = nodeOf({ connection: bastion() })

    await vm.copyConfig()
    expect(vm.isCopied).toBe(true)
    vi.advanceTimersByTime(1499)
    expect(vm.isCopied).toBe(true)
    vi.advanceTimersByTime(1)
    expect(vm.isCopied).toBe(false)
  })

  it('keeps the mark for a second and a half after the last of two copies', async () => {
    vi.useFakeTimers()
    preload()
    const { vm } = nodeOf({ connection: bastion() })

    await vm.copyConfig()
    vi.advanceTimersByTime(1000)
    await vm.copyConfig()
    vi.advanceTimersByTime(600)
    expect(vm.isCopied).toBe(true)
    vi.advanceTimersByTime(900)
    expect(vm.isCopied).toBe(false)
  })
})
