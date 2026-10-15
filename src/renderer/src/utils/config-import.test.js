import { describe, expect, it } from 'vitest'
import { DEFAULT_SSH_PORT, MANY_CONFIG_NODES, importConcerns, importCount, importPlan, rowDetail } from './config-import.js'
import { MAX_CONFIG_HOSTS, parseSshConfig } from '../../../shared/ssh-config-parse.js'
import { buildSshConfig } from '../../../main/ssh-config.js'
import { isRoutable } from './forward.js'

const planOf = text => importPlan(parseSshConfig(text))
const sorted = links => [...links].sort((a, b) => a[1] - b[1] || a[0] - b[0])

describe('importPlan', () => {
  // "거기 있는 것만 들어가 있는 노드": 글에 없는 값은 키도 없다 (노드에서는 비어 있다).
  describe('the values of a node', () => {
    it('are only what the text names', () => {
      expect(planOf('Host web\n  HostName 192.0.2.10\n  User root\n  Port 2200').nodes).toEqual([
        { name: 'web', host: '192.0.2.10', user: 'root', port: '2200' }
      ])
      expect(planOf('Host web\n  HostName 192.0.2.10').nodes[0]).not.toHaveProperty('user')
    })

    it('take the key, the command and the forwards when the text has them', () => {
      const text = 'Host web\n  HostName 192.0.2.10\n  IdentityFile ~/.ssh/web\n  RemoteCommand htop\n  LocalForward 8080 localhost:80\n  LocalForward 5433 db:5432'

      expect(planOf(text).nodes).toEqual([{
        name: 'web',
        host: '192.0.2.10',
        port: '22',
        keyPath: '~/.ssh/web',
        exec: 'htop',
        // config에 적힌 포워딩은 켜져 있는 것이다
        forwards: [
          { checked: true, from: '8080', host: 'localhost', to: '80' },
          { checked: true, from: '5433', host: 'db', to: '5432' }
        ]
      }])
    })

    it('never hold a password, an icon or an empty value', () => {
      const [node] = planOf('Host web\n  User root').nodes

      expect(Object.keys(node).sort()).toEqual(['host', 'name', 'port', 'user'])
    })

    // ssh는 Port가 없으면 22번으로 간다. 노드는 포트가 없으면 접속할 수 없고, 경로 안에서는 포워딩 대상이라는 다른 뜻이 된다.
    it('have the port of ssh when the text names none, so a node with a user can connect', () => {
      const [node] = planOf('Host web\n  HostName 192.0.2.10\n  User root').nodes

      expect(DEFAULT_SSH_PORT).toBe('22')
      expect(node.port).toBe('22')
      expect(isRoutable(node)).toBe(true)
    })
  })

  describe('ProxyJump', () => {
    it('makes no connection when there is none', () => {
      expect(planOf('Host a\n\nHost b').links).toEqual([])
    })

    it('connects a host after its jump host, wherever the blocks stand in the text', () => {
      expect(planOf('Host app\n  ProxyJump gate\n\nHost gate').links).toEqual([[1, 0]])
    })

    it('lets several hosts go through one jump host', () => {
      expect(sorted(planOf('Host gate\n\nHost a\n  ProxyJump gate\n\nHost b\n  ProxyJump gate').links)).toEqual([[0, 1], [0, 2]])
    })

    // "ProxyJump a,b"인 c는 a -> b -> c로 간다.
    it('draws the whole path of a list of jumps', () => {
      expect(sorted(planOf('Host a\n\nHost b\n\nHost c\n  ProxyJump a,b').links)).toEqual([[0, 1], [1, 2]])
    })

    // buildSshConfig는 노드마다 앞의 노드 전부를 적는다.
    it('draws a path once when every block lists all the hosts before it', () => {
      expect(sorted(planOf('Host a\n\nHost b\n  ProxyJump a\n\nHost c\n  ProxyJump a,b\n\nHost d\n  ProxyJump a,b,c').links)).toEqual([[0, 1], [1, 2], [2, 3]])
    })

    // 노드의 입력은 하나다. b의 묶음이 말한 것이 b의 앞이다.
    it('keeps what the own block of a jump host says, and notes the list that does not fit', () => {
      const plan = planOf('Host a\n\nHost z\n\nHost b\n  ProxyJump z\n\nHost c\n  ProxyJump a,b')

      expect(sorted(plan.links)).toEqual([[1, 2], [2, 3]])
      expect(plan.notes).toEqual(['c: ProxyJump a,b does not fit the connections of the other blocks. It is connected as far as it fits.'])
    })

    it('does not connect to a jump host that is not in the text, and says so', () => {
      const plan = planOf('Host app\n  ProxyJump ops@gate.example.com:2222\n\nHost db\n  ProxyJump gate,app')

      // gate는 글에 없다: app -> db만 이어진다
      expect(plan.links).toEqual([[0, 1]])
      expect(plan.notes).toEqual([
        'app: ProxyJump through ops@gate.example.com:2222, not a Host in this text. That connection is not made.',
        'db: ProxyJump through gate, not a Host in this text. That connection is not made.'
      ])
    })

    it('never makes a loop, and never connects a host to itself', () => {
      const loop = planOf('Host a\n  ProxyJump b\n\nHost b\n  ProxyJump a')
      expect(loop.links).toEqual([[1, 0]])
      expect(loop.notes).toEqual(['b: ProxyJump a does not fit the connections of the other blocks. It is connected as far as it fits.'])

      const self = planOf('Host a\n  ProxyJump a')
      expect(self.links).toEqual([])
      expect(self.notes).toHaveLength(1)

      const ring = planOf('Host a\n  ProxyJump c\n\nHost b\n  ProxyJump a\n\nHost c\n  ProxyJump b')
      expect(sorted(ring.links)).toEqual([[2, 0], [0, 1]])
    })

    it('gives every node one node before it at most', () => {
      const plan = planOf('Host a\n\nHost b\n\nHost c\n  ProxyJump a\n\nHost d\n  ProxyJump b,c\n\nHost e\n  ProxyJump b,c,d')
      const targets = plan.links.map(([, to]) => to)

      expect(new Set(targets).size).toBe(targets.length)
    })
  })

  // "Copy SSH config"가 쓴 글을 붙이면 같은 경로가 나온다 (비밀번호와, 마지막이 아닌 노드의 exec는 config에 없다).
  it('brings back the path that Copy SSH config wrote', () => {
    const bastion = { name: 'bastion', user: 'ops', host: '10.0.0.1', port: '22', keyPath: '/c/Users/me/.ssh/id_ed25519', password: 'secret' }
    const app = { name: 'app', user: 'deploy', host: 'app.internal', port: '2222' }
    const db = { name: 'db', user: 'postgres', host: '10.0.2.5', port: '5022', exec: 'psql' }
    const forwards = [{ checked: true, from: '5433', host: 'localhost', to: '5432' }]
    const plan = planOf(buildSshConfig([bastion, app, db], { forwards }))

    expect(plan.nodes).toEqual([
      { name: 'bastion', user: 'ops', host: '10.0.0.1', port: '22', keyPath: '/c/Users/me/.ssh/id_ed25519' },
      app,
      { ...db, forwards }
    ])
    expect(sorted(plan.links)).toEqual([[0, 1], [1, 2]])
    expect(plan.notes).toEqual([])
    expect(JSON.stringify(plan)).not.toContain('secret')
  })

  describe('the rows shown before creating', () => {
    it('say where each node connects to and what else it holds', () => {
      const text = 'Host gate\n  HostName 192.0.2.1\n  User ops\n\nHost app\n  HostName app.internal\n  Port 2222\n  ProxyJump gate\n  IdentityFile ~/.ssh/app\n  RemoteCommand htop\n  LocalForward 8080 localhost:80'

      expect(planOf(text).rows).toEqual([
        { name: 'gate', target: 'ops@192.0.2.1:22', after: '', extras: [], problem: '' },
        { name: 'app', target: 'app.internal:2222', after: 'gate', extras: ['key', 'exec', '1 forward'], problem: '' }
      ])
      expect(planOf('Host a\n  LocalForward 1 a:2\n  LocalForward 3 a:4').rows[0].extras).toEqual(['2 forwards'])
    })

    // 접속할 때 main이 거절할 값은 미리 알린다 (src/shared/validate.js). 노드는 그대로 만든다: 노드 설정에서 고칠 수 있다.
    it('flag a value that ssh would be refused with, and still plan the node', () => {
      const plan = planOf('Host my server\n\nHost a\n  Port 99999\n\nHost b\n  User -oProxyCommand=x\n\nHost c\n  LocalForward 80 a:1\n  LocalForward 80 b:2\n\nHost fine\n  HostName 192.0.2.1')

      expect(plan.nodes).toHaveLength(5)
      expect(plan.rows.map(x => x.problem)).toEqual([
        '',
        'Port must be a number between 1 and 65535.',
        'Invalid user: "-oProxyCommand=x"',
        'Local port 80 is used by more than one forward.',
        ''
      ])
      // "Host my server"는 이름 둘이다: 첫 이름이 노드가 된다
      expect(plan.rows[0].name).toBe('my')
      expect(planOf('Host "my server"').rows[0].problem).toBe('Invalid host: "my server"')
    })
  })

  describe('the notes', () => {
    it('name what a node has no place for, once whatever the case', () => {
      expect(planOf('Host a\n  ForwardAgent yes\n  forwardagent no\n  Compression yes').notes).toEqual(['Not used, a node has no place for it: ForwardAgent, Compression.'])
    })

    it('count the blocks that are not one server', () => {
      expect(planOf('Host *\n  User x\n\nHost a').notes).toEqual(['1 block left out: a Host of only patterns (such as *) or a Match is not one server.'])
      expect(planOf('Host *\n\nMatch all\n\nHost a').notes[0]).toMatch(/^2 blocks left out/)
    })

    it('count the blocks over the limit', () => {
      const text = Array.from({ length: MAX_CONFIG_HOSTS + 2 }, (_, i) => `Host h${i}`).join('\n')
      const plan = planOf(text)

      expect(plan.nodes).toHaveLength(MAX_CONFIG_HOSTS)
      expect(plan.notes).toEqual([`2 more Host blocks left out: at most ${MAX_CONFIG_HOSTS} nodes at a time.`])
    })

    it('are none for a text that fits', () => {
      expect(planOf('Host a\n  HostName 192.0.2.1\n  User root\n  Port 22').notes).toEqual([])
    })
  })

  it('plans nothing for a text without a host, or without a result at all', () => {
    for (const plan of [planOf(''), planOf('hello'), importPlan(undefined), importPlan({})]) {
      expect(plan).toEqual({ nodes: [], links: [], rows: [], notes: [] })
    }
  })
})

describe('rowDetail', () => {
  it('says which node a row comes after and what else it holds', () => {
    const [gate, app, bare] = planOf('Host gate\n  IdentityFile ~/.ssh/gate\n\nHost app\n  ProxyJump gate\n  RemoteCommand htop\n  LocalForward 1 a:2\n\nHost bare\n  ProxyJump gate').rows

    expect(rowDetail(gate)).toBe('key')
    expect(rowDetail(app)).toBe('through gate, exec, 1 forward')
    expect(rowDetail(bare)).toBe('through gate')
    expect(rowDetail(planOf('Host a').rows[0])).toBe('')
  })
})

describe('importCount', () => {
  it('says how many nodes and connections will be made', () => {
    expect(importCount(planOf('Host a'))).toBe('1 node')
    expect(importCount(planOf('Host a\n\nHost b'))).toBe('2 nodes')
    expect(importCount(planOf('Host a\n\nHost b\n  ProxyJump a'))).toBe('2 nodes, 1 connection')
    expect(importCount(planOf('Host a\n\nHost b\n  ProxyJump a\n\nHost c\n  ProxyJump a'))).toBe('3 nodes, 2 connections')
  })
})

// 지나쳐 보이면 만들기 전에 이유를 늘어놓고 묻는다 (owner, 2026-10-15). 무엇이 지나친지는 여기서 정했다.
describe('importConcerns', () => {
  const hosts = (count, first = 1) => Array.from({ length: count }, (x, i) => `Host h${first + i}\n  HostName 192.0.2.${first + i}\n  User ops`).join('\n')
  const concernsOf = (text, existing) => {
    const parsed = parseSshConfig(text)
    return importConcerns(importPlan(parsed), parsed, existing)
  }

  it('are none for a text that fits, up to ten nodes', () => {
    expect(MANY_CONFIG_NODES).toBe(10)
    expect(concernsOf(hosts(1))).toEqual([])
    expect(concernsOf(hosts(MANY_CONFIG_NODES))).toEqual([])
  })

  it('name more than ten nodes at once', () => {
    expect(concernsOf(hosts(MANY_CONFIG_NODES + 1))).toEqual(['11 nodes at once: more than 10 fill the diagram.'])
  })

  it('name the Host blocks left out over the limit, with the many nodes', () => {
    expect(concernsOf(hosts(MAX_CONFIG_HOSTS + 2))).toEqual([
      '50 nodes at once: more than 10 fill the diagram.',
      '2 more Host blocks left out: at most 50 at a time.'
    ])
    expect(concernsOf(hosts(MAX_CONFIG_HOSTS + 1))[1]).toBe('1 more Host block left out: at most 50 at a time.')
  })

  it('name the nodes with a value ssh would refuse, three of them and how many more', () => {
    const bad = name => `Host ${name}\n  HostName 192.0.2.9\n  Port 70000`

    expect(concernsOf(`${bad('x1')}\n${hosts(1)}`)).toEqual(['1 node with a value ssh would refuse: x1.'])
    expect(concernsOf(['x1', 'x2', 'x3'].map(bad).join('\n'))).toEqual(['3 nodes with a value ssh would refuse: x1, x2, x3.'])
    expect(concernsOf(['x1', 'x2', 'x3', 'x4', 'x5'].map(bad).join('\n'))).toEqual(['5 nodes with a value ssh would refuse: x1, x2, x3 and 2 more.'])
  })

  it('name the nodes the diagram already has: the same user, host and port', () => {
    expect(concernsOf(hosts(2), ['ops@192.0.2.2:22'])).toEqual(['1 node already in this diagram (same user, host and port): h2.'])
    expect(concernsOf(hosts(2), ['ops@192.0.2.1:22', 'ops@192.0.2.2:22', 'x@y:1'])).toEqual(['2 nodes already in this diagram (same user, host and port): h1, h2.'])
    // ssh's port 22 that the plan fills in counts like a written one
    expect(concernsOf('Host a\n  HostName 192.0.2.1\n  User ops', ['ops@192.0.2.1:22'])).toHaveLength(1)
  })

  it('do not take another user, another port or a block without a user for the same node', () => {
    expect(concernsOf('Host a\n  HostName 192.0.2.1\n  User ops', ['root@192.0.2.1:22', 'ops@192.0.2.1:2200'])).toEqual([])
    expect(concernsOf('Host a\n  HostName 192.0.2.1', ['root@192.0.2.1:22'])).toEqual([])
  })

  // 창의 notes가 이미 말하는 것이고, 지나치게 만드는 것이 아니다
  it('leave out what the notes already tell: unused keywords, Host * and Match, a jump host not in the text, two names for one server', () => {
    const text = 'Host *\n  ServerAliveInterval 30\n\nMatch host x\n  User y\n\nHost a\n  HostName 192.0.2.1\n  ForwardAgent yes\n  ProxyJump nowhere\n\nHost b\n  HostName 192.0.2.1'

    expect(planOf(text).notes).toHaveLength(3)
    expect(concernsOf(text)).toEqual([])
  })

  it('come in a fixed order, all of them at once', () => {
    const text = `${hosts(11)}\nHost x1\n  HostName 192.0.2.99\n  Port 70000`

    expect(concernsOf(text, ['ops@192.0.2.3:22']).map(reason => reason.split(' ').slice(1, 3).join(' '))).toEqual(['nodes at', 'node with', 'node already'])
  })

  it('are none without a plan', () => {
    expect(importConcerns(undefined, undefined)).toEqual([])
    expect(importConcerns(importPlan({}), {}, [])).toEqual([])
  })
})
