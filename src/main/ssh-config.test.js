import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildSshConfig } from './ssh-config.js'
import { buildProxyJump, toUnixPath } from './ssh.js'

const jump = { name: 'jump host', user: 'jumper', host: 'jump.example.com', port: '22', keyPath: 'C:\\keys\\a b' }
const inner = { name: 'inner', user: 'root', host: '10.0.0.5', port: '2222', exec: 'cd /tmp' }

describe('buildSshConfig', () => {
  it('builds a single host', () => {
    expect(buildSshConfig([jump])).toBe([
      'Host jump-host',
      '    HostName jump.example.com',
      '    User jumper',
      '    Port 22',
      '    IdentityFile "C:/keys/a b"',
      '    IdentitiesOnly yes',
      ''
    ].join('\n'))
  })

  it('chains previous nodes with ProxyJump', () => {
    const config = buildSshConfig([jump, inner])
    expect(config).toContain('Host inner\n    HostName 10.0.0.5\n    User root\n    Port 2222\n    ProxyJump jump-host\n')
    expect(config).toContain('    RemoteCommand cd /tmp; exec $SHELL\n    RequestTTY yes')
  })

  // RemoteCommand는 한 줄이고 "; exec $SHELL"로 끝난다: 그 앞의 ;는 빼고(;;는 문법 오류다), ;를 붙일 수 없는 명령은 넣지 않는다
  it('writes a remote command that ends with ; without it, and leaves out one that ends with & or has several lines', () => {
    const remote = exec => buildSshConfig([{ ...inner, exec }]).match(/^ {4}RemoteCommand (.*)$/m)?.[1] ?? null

    expect(remote('cd /tmp;')).toBe('cd /tmp; exec $SHELL')
    expect(remote('cd /tmp ; ;')).toBe('cd /tmp; exec $SHELL')
    expect(remote('make && make install')).toBe('make && make install; exec $SHELL')
    expect(remote('sleep 9 &')).toBeNull()
    expect(remote('&')).toBeNull()
    expect(remote('echo a\necho b')).toBeNull()
    expect(remote(';')).toBeNull()
    expect(buildSshConfig([{ ...inner, exec: 'sleep 9 &' }])).not.toContain('RequestTTY')
  })

  it('makes aliases unique and falls back to the host', () => {
    const config = buildSshConfig([{ ...jump, name: 'x' }, { ...inner, name: 'x' }, { ...inner, name: '' }])
    expect(config).toMatch(/^Host x$/m)
    expect(config).toMatch(/^Host x-2$/m)
    expect(config).toMatch(/^Host 10\.0\.0\.5$/m)
    expect(config).toContain('ProxyJump x,x-2')
  })

  describe('forwards', () => {
    it('writes the enabled forwards as LocalForward on the last node', () => {
      const config = buildSshConfig([jump, inner], {
        forwards: [
          { checked: true, from: '15432', host: 'db.internal', to: '5432' },
          { checked: true, from: '8080', to: '80' },
          { checked: false, from: '9999', to: '1' }
        ]
      })

      const [first, second] = config.split('\n\n')
      expect(first).not.toContain('LocalForward')
      expect(second).toContain('    LocalForward 15432 db.internal:5432\n    LocalForward 8080 localhost:80')
      expect(config).not.toContain('9999')
    })

    it('brackets IPv6 targets and works for a single node', () => {
      const config = buildSshConfig([jump], { forwards: [{ checked: true, from: '1', host: 'fe80::1', to: '2' }] })
      expect(config).toContain('    LocalForward 1 [fe80::1]:2')
    })

    it('writes nothing when no forward is enabled, and rejects invalid ones', () => {
      expect(buildSshConfig([jump], { forwards: [{ checked: false, from: '1', to: '2' }] })).not.toContain('LocalForward')
      expect(buildSshConfig([jump])).not.toContain('LocalForward')
      expect(() => buildSshConfig([jump], { forwards: [{ checked: true, from: '1', to: '' }] })).toThrow()
      expect(() => buildSshConfig([jump], { forwards: [{ checked: true, from: '1', host: 'a b', to: '2' }] })).toThrow()
    })
  })

  it('never exports the password', () => {
    const config = buildSshConfig([{ ...jump, password: 'secret' }])
    expect(config).not.toContain('secret')
    expect(config).toContain('# password is not exported')
  })

  it('accepts a partially filled node but needs a host', () => {
    expect(buildSshConfig([{ host: 'example.com' }])).toBe('Host example.com\n    HostName example.com\n')
    expect(() => buildSshConfig([{ user: 'u' }])).toThrow()
    expect(() => buildSshConfig([])).toThrow()
  })

  it('rejects hostile values', () => {
    expect(() => buildSshConfig([{ host: 'a\nProxyCommand x' }])).toThrow()
    expect(() => buildSshConfig([{ host: 'h', keyPath: 'a"\nb' }])).toThrow()
  })

  // ssh는 HostName, IdentityFile과 RemoteCommand의 %를 토큰(%h, %u, ...)으로 읽는다: 글자 %는 %%로 쓴다
  it('writes a percent sign of the host and of the remote command twice', () => {
    const config = buildSshConfig([{ ...inner, host: 'fe80::1%eth0', exec: 'date +%Y' }])
    expect(config).toContain('    HostName fe80::1%%eth0\n')
    expect(config).toContain('    RemoteCommand date +%%Y; exec $SHELL\n')
  })
})

// ssh 자신에게 읽혀 본다 (-G: 아무 데도 접속하지 않고 읽은 설정을 보여 준다). 앱이 쓰는 ssh로: Windows에서는 Git의 것.
// %를 그대로 쓴 config는 "unknown key %e"로 거절되었다 (#236): fe80::1%eth0을 거치는 ProxyJump와 포워딩이 시작하지 못했다.
const SSH = process.platform === 'win32' ? join(process.env.ProgramFiles || 'C:/Program Files', 'Git', 'usr', 'bin', 'ssh.exe') : 'ssh'
const canAskSsh = spawnSync(SSH, ['-V']).status === 0

describe.skipIf(!canAskSsh)('what ssh itself reads from the config (ssh -G)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jumpspace-config-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  let seq = 0
  const read = (config, alias) => {
    const file = join(dir, `config${seq++}`)
    writeFileSync(file, config)
    const r = spawnSync(SSH, ['-G', '-F', toUnixPath(file), alias], { encoding: 'utf8', timeout: 10000 })
    const options = Object.fromEntries(r.stdout.split(/\r?\n/).filter(Boolean).map(line => [line.split(' ')[0], line.slice(line.indexOf(' ') + 1)]))
    // (stdin is no terminal: ssh may say so, which is not an error of the config)
    const refused = /percent|unknown key/i.test(r.stderr) ? r.stderr.trim() : ''
    return { status: r.status, refused, hostname: options.hostname, remotecommand: options.remotecommand }
  }
  const zoned = { name: 'zoned', user: 'root', host: 'fe80::1%eth0', port: '22', exec: 'date +%Y' }

  it('Copy SSH config: the host and the remote command as they were typed', () => {
    expect(read(buildSshConfig([zoned]), 'zoned')).toEqual({ status: 0, refused: '', hostname: 'fe80::1%eth0', remotecommand: 'date +%Y; exec $SHELL' })
  })

  it('the config of a ProxyJump session: the host as it was typed', () => {
    const built = buildProxyJump([{ ...zoned, name: 'jump', exec: '' }, inner], { scriptPath: '/tmp/s.sh', configPath: '/tmp/c.jmp' })
    const alias = built.config.match(/^Host (\w+)$/m)[1]

    expect(read(built.config, alias)).toMatchObject({ status: 0, refused: '', hostname: 'fe80::1%eth0' })
  })
})
