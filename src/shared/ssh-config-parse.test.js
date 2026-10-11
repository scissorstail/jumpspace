import { describe, expect, it } from 'vitest'
import { MAX_CONFIG_HOSTS, parseSshConfig } from './ssh-config-parse.js'
import { buildSshConfig } from '../main/ssh-config.js'

const hostsOf = text => parseSshConfig(text).hosts

describe('parseSshConfig', () => {
  // "Copy SSH config"가 쓴 글을 붙이면 같은 노드들이 나와야 한다 (비밀번호는 config에 없다).
  describe('reads back what Copy SSH config writes', () => {
    const bastion = { name: 'bastion', user: 'ops', host: '10.0.0.1', port: '22', keyPath: '/c/Users/me/.ssh/id_ed25519' }
    const app = { name: 'app', user: 'deploy', host: 'app.internal', port: '2222', exec: 'tail -f /var/log/syslog' }

    it('a single node', () => {
      expect(hostsOf(buildSshConfig([bastion]))).toEqual([{ ...bastion, jumps: [] }])
    })

    it('a path: every node, with the nodes before it as its jumps', () => {
      const db = { name: 'db', user: 'postgres', host: '10.0.2.5', port: '22' }

      expect(hostsOf(buildSshConfig([bastion, app, db]))).toEqual([
        { ...bastion, jumps: [] },
        // exec는 접속하는 마지막 노드의 것만 config에 쓰인다
        { name: 'app', user: 'deploy', host: 'app.internal', port: '2222', jumps: ['bastion'] },
        { ...db, jumps: ['bastion', 'app'] }
      ])
    })

    it('the command and the forwards of the last node', () => {
      const forwards = [
        { checked: true, from: '8080', host: 'localhost', to: '80' },
        { checked: true, from: '5433', host: 'fe80::1', to: '5432' },
        { checked: false, from: '9000', host: 'localhost', to: '9000' }
      ]

      expect(hostsOf(buildSshConfig([bastion, app], { forwards }))[1]).toEqual({
        ...app,
        jumps: ['bastion'],
        forwards: [
          { from: '8080', host: 'localhost', to: '80' },
          { from: '5433', host: 'fe80::1', to: '5432' }
        ]
      })
    })

    it('a key path with a space and a percent sign', () => {
      const node = { ...bastion, keyPath: '/c/Users/me/my keys/100%/id' }

      expect(hostsOf(buildSshConfig([node]))[0].keyPath).toBe('/c/Users/me/my keys/100%/id')
    })

    it('never a password', () => {
      const result = parseSshConfig(buildSshConfig([{ ...bastion, password: 'hunter2' }]))

      expect(JSON.stringify(result)).not.toContain('hunter2')
      expect(result.hosts[0]).not.toHaveProperty('password')
      expect(result.ignored).toEqual([])
    })
  })

  // 글에 있는 것만 들어간다. 없는 값은 키가 없다: 노드에서는 비어 있거나 기본값이다.
  it('holds only what the text names', () => {
    expect(hostsOf('Host web\n  HostName 192.0.2.10\n')).toEqual([{ name: 'web', host: '192.0.2.10', jumps: [] }])
    expect(hostsOf('Host web\n  User root\n')).toEqual([{ name: 'web', host: 'web', user: 'root', jumps: [] }])
  })

  // ssh는 HostName이 없으면 Host에 적힌 이름으로 접속한다.
  it('takes the name of the block for the host when there is no HostName', () => {
    expect(hostsOf('Host 192.0.2.7\n  Port 2200')).toEqual([{ name: '192.0.2.7', host: '192.0.2.7', port: '2200', jumps: [] }])
  })

  it('reads keywords in any case, with spaces or an equals sign, and any indent', () => {
    const text = ['HOST one', 'hostname=192.0.2.1', '\tUser = alice', '      PORT   2022', 'identityFile ~/.ssh/one'].join('\n')

    expect(hostsOf(text)).toEqual([{ name: 'one', host: '192.0.2.1', user: 'alice', port: '2022', keyPath: '~/.ssh/one', jumps: [] }])
  })

  it('skips comments and empty lines, and reads Windows line endings', () => {
    const text = '# my servers\r\n\r\nHost one\r\n    # the address\r\n    HostName 192.0.2.1\r\n\r\n'

    expect(parseSshConfig(text)).toEqual({ hosts: [{ name: 'one', host: '192.0.2.1', jumps: [] }], ignored: [], skipped: 0, over: 0 })
  })

  it('takes quotes off a value', () => {
    expect(hostsOf('Host one\n  HostName "192.0.2.1"\n  User "alice"\n  IdentityFile "C:/Users/me/my keys/id"')[0]).toMatchObject({
      host: '192.0.2.1',
      user: 'alice',
      keyPath: 'C:/Users/me/my keys/id'
    })
  })

  // ssh는 같은 설정이 여러 번 나오면 처음 것을 쓴다.
  it('keeps the first value when a setting comes twice', () => {
    const text = 'Host one\n  User first\n  User second\n  IdentityFile ~/.ssh/a\n  IdentityFile ~/.ssh/b\n  ProxyJump a\n  ProxyJump b'

    expect(hostsOf(text)[0]).toMatchObject({ user: 'first', keyPath: '~/.ssh/a', jumps: ['a'] })
  })

  it('makes one host of two blocks with the same name, the first value winning', () => {
    const text = 'Host one\n  User alice\n\nHost two\n  User bob\n\nHost one\n  User carol\n  Port 2022'

    expect(hostsOf(text)).toEqual([
      { name: 'one', host: 'one', user: 'alice', port: '2022', jumps: [] },
      { name: 'two', host: 'two', user: 'bob', jumps: [] }
    ])
  })

  describe('the names of a block', () => {
    it('uses the first name that stands for one host', () => {
      expect(hostsOf('Host *.example.com !old web w\n  User a')[0].name).toBe('web')
      expect(hostsOf('Host "my server"\n  HostName 192.0.2.3')[0].name).toBe('my server')
    })

    // Host * 는 모든 호스트의 기본값이다: 호스트 하나가 아니다.
    it('leaves out blocks that are only patterns, and Match blocks, with all their lines', () => {
      const text = 'Host *\n  User everyone\n  ServerAliveInterval 30\n\nMatch host *.lan\n  User lan\n\nHost dev?\n  Port 1\n\nHost web\n  HostName 192.0.2.10'

      expect(parseSshConfig(text)).toEqual({ hosts: [{ name: 'web', host: '192.0.2.10', jumps: [] }], ignored: [], skipped: 3, over: 0 })
    })
  })

  describe('ProxyJump', () => {
    it('lists the jumps in their order', () => {
      expect(hostsOf('Host c\n  ProxyJump a, b')[0].jumps).toEqual(['a', 'b'])
      expect(hostsOf('Host c\n  ProxyJump=ops@gate.example.com:2222')[0].jumps).toEqual(['ops@gate.example.com:2222'])
    })

    it('reads "none" as no jump', () => {
      expect(hostsOf('Host c\n  ProxyJump none')[0].jumps).toEqual([])
      expect(hostsOf('Host c\n  ProxyJump NONE\n  ProxyJump a')[0].jumps).toEqual([])
    })
  })

  describe('RemoteCommand', () => {
    it('is the exec of the node, without the shell the app adds after it', () => {
      expect(hostsOf('Host a\n  RemoteCommand htop; exec $SHELL')[0].exec).toBe('htop')
      expect(hostsOf('Host a\n  RemoteCommand cd /srv && ls -la')[0].exec).toBe('cd /srv && ls -la')
    })

    it('keeps quotes and equals signs inside the command', () => {
      expect(hostsOf('Host a\n  RemoteCommand FOO="a b" env | grep FOO=')[0].exec).toBe('FOO="a b" env | grep FOO=')
    })
  })

  describe('LocalForward', () => {
    it('reads the local port and the target, with or without an address to bind', () => {
      const text = ['Host a', 'LocalForward 8080 localhost:80', 'LocalForward 127.0.0.1:5433 db.internal:5432', 'LocalForward [::1]:9000 [2001:db8::5]:9000', 'LocalForward=*:7000 10.0.0.9:70'].join('\n')

      expect(hostsOf(text)[0].forwards).toEqual([
        { from: '8080', host: 'localhost', to: '80' },
        { from: '5433', host: 'db.internal', to: '5432' },
        { from: '9000', host: '2001:db8::5', to: '9000' },
        { from: '7000', host: '10.0.0.9', to: '70' }
      ])
    })

    it('reports a forward it cannot hold (a socket, a missing target) and makes no forward of it', () => {
      const result = parseSshConfig('Host a\n  LocalForward /tmp/a.sock /var/run/b.sock\n  LocalForward 8080\n  LocalForward 1 a:2 extra')

      expect(result.hosts[0]).not.toHaveProperty('forwards')
      expect(result.ignored).toEqual(['LocalForward'])
    })
  })

  describe('what a node cannot hold', () => {
    it('is reported once, as written, and left out', () => {
      const result = parseSshConfig('Host a\n  ForwardAgent yes\n  ServerAliveInterval 30\n  forwardagent no\n  HostName 192.0.2.1\n\nHost b\n  Compression yes')

      expect(result.hosts).toEqual([
        { name: 'a', host: '192.0.2.1', jumps: [] },
        { name: 'b', host: 'b', jumps: [] }
      ])
      expect(result.ignored).toEqual(['ForwardAgent', 'ServerAliveInterval', 'forwardagent', 'Compression'])
    })

    // buildSshConfig가 키, exec와 함께 쓰는 줄이다. 알릴 것이 없다.
    it('says nothing about IdentitiesOnly and RequestTTY', () => {
      expect(parseSshConfig('Host a\n  IdentitiesOnly yes\n  RequestTTY yes').ignored).toEqual([])
    })

    // 첫 Host 앞의 설정은 모든 호스트에 걸린다: 노드 하나의 값이 아니다.
    it('reports the settings before the first Host and gives them to no node', () => {
      expect(parseSshConfig('User everyone\nPort 2022\n\nHost a\n  HostName 192.0.2.1')).toEqual({
        hosts: [{ name: 'a', host: '192.0.2.1', jumps: [] }],
        ignored: ['User', 'Port'],
        skipped: 0,
        over: 0
      })
    })
  })

  it('finds nothing in a text without a Host, in an empty text, or in something that is not a text', () => {
    for (const text of ['', '   \n\n', 'just some words', 'HostName 192.0.2.1', null, undefined]) {
      expect(parseSshConfig(text).hosts).toEqual([])
    }
    expect(parseSshConfig('Host\n  User a').hosts).toEqual([])
    expect(parseSshConfig('Host   \n  User a').hosts).toEqual([])
  })

  // 긴 config를 통째로 붙여도 캔버스가 노드로 덮이지 않는다.
  it('stops at the limit and says how many blocks it left', () => {
    const text = Array.from({ length: MAX_CONFIG_HOSTS + 3 }, (_, i) => `Host h${i}\n  HostName 192.0.2.${i}`).join('\n\n')
    const result = parseSshConfig(text)

    expect(result.hosts).toHaveLength(MAX_CONFIG_HOSTS)
    expect(result.hosts[MAX_CONFIG_HOSTS - 1].name).toBe(`h${MAX_CONFIG_HOSTS - 1}`)
    expect(result.over).toBe(3)
    expect(result.skipped).toBe(0)
  })

  it('still adds to a host it already has after the limit is reached', () => {
    const text = Array.from({ length: MAX_CONFIG_HOSTS + 1 }, (_, i) => `Host h${i}`).join('\n') + '\nHost h0\n  User late'

    expect(parseSshConfig(text).hosts[0]).toEqual({ name: 'h0', host: 'h0', user: 'late', jumps: [] })
  })
})
