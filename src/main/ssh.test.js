import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { bracketHost, buildConnect, buildForward, buildProxyJump, sq, toUnixPath } from './ssh.js'
import { buildSshConfig } from './ssh-config.js'

const paths = { scriptPath: 'C:/tmp/jumpspace/a.sh', configPath: 'C:/tmp/jumpspace/a.jmp' }
const node = { name: 'web', user: 'deploy', host: 'example.com', port: '22', keyPath: 'C:\\Users\\me\\.ssh\\id_rsa', exec: '' }

// config에서 Host 별칭 목록과 Host별 설정 줄을 꺼낸다.
const aliasesOf = config => [...config.matchAll(/^Host (\w+)$/gm)].map(x => x[1])
const blocksOf = config => Object.fromEntries(config.trim().split('\n\n').map(block => {
  const [head, ...lines] = block.split('\n')
  return [head.replace('Host ', ''), lines]
}))

describe('sq', () => {
  it('escapes single quotes', () => {
    expect(sq("it's")).toBe("'it'\\''s'")
    expect(sq('a b')).toBe("'a b'")
  })
})

describe('buildConnect', () => {
  it('builds ssh command', () => {
    const script = buildConnect(node, paths).script
    // "$@": 앱 안의 터미널에서만 채워지는 옵션 자리 (접속 표시)
    expect(script).toContain("ssh -o StrictHostKeyChecking=accept-new \"$@\" -i 'C:/Users/me/.ssh/id_rsa' -o IdentitiesOnly=yes -p '22' -- 'deploy@example.com'")
    expect(script).not.toContain('-tt')
  })

  it('keeps hostile name as data', () => {
    const script = buildConnect({ ...node, name: "x'; touch /tmp/pwned; echo '" }, paths).script
    expect(script).toContain(sq("Connect... deploy@example.com:22 (x'; touch /tmp/pwned; echo ')"))
  })

  it('appends exec with a tty', () => {
    const script = buildConnect({ ...node, exec: "cd /var/log; echo 'hi'" }, paths).script
    expect(script).toContain(`-tt -- 'deploy@example.com' ${sq("cd /var/log; echo 'hi'; exec $SHELL")}`)
  })

  it('omits -i when there is no key', () => {
    const { script } = buildConnect({ ...node, keyPath: '' }, paths)
    expect(script).not.toContain(' -i ')
    expect(script).not.toContain('IdentitiesOnly')
  })

  it('exits with the status of ssh', () => {
    expect(buildConnect(node, paths).script).toContain('exit "$rc"')
  })

  it('rejects options injected through host', () => {
    expect(() => buildConnect({ ...node, host: '-oProxyCommand=calc' }, paths).script).toThrow()
  })

  it('removes its own script when finished', () => {
    expect(buildConnect(node, paths).script).toContain("rm -f -- 'C:/tmp/jumpspace/a.sh'")
  })
})

describe('buildForward', () => {
  const forwards = [{ checked: true, from: '15432', host: 'db.internal', to: '5432' }, { checked: false, from: '1', to: '2' }]

  it('opens -L on the node it connects to, towards the target as seen from that node', () => {
    const { script, config } = buildForward({ via: [node], forwards }, paths)
    const [alias] = aliasesOf(config)

    expect(script).toContain(`-F 'C:/tmp/jumpspace/a.jmp' -N -o ExitOnForwardFailure=yes -L 'localhost:15432:db.internal:5432' -- '${alias}'`)
    expect(script).not.toContain(' -J ')
    expect(script).not.toContain(':1:')
    expect(script).toContain("rm -f -- 'C:/tmp/jumpspace/a.sh' 'C:/tmp/jumpspace/a.jmp'")
  })

  it('uses localhost when the target host is left blank (a service on the node itself)', () => {
    const { script } = buildForward({ via: [node], forwards: [{ checked: true, from: '8080', host: '', to: '80' }] }, paths)
    expect(script).toContain("-L 'localhost:8080:localhost:80'")
  })

  it('opens several forwards in one ssh', () => {
    const { script } = buildForward({
      via: [node],
      forwards: [
        { checked: true, from: '8080', to: '80' },
        { checked: true, from: '15432', host: '10.0.0.5', to: '5432' }
      ]
    }, paths)
    expect(script).toContain("-L 'localhost:8080:localhost:80' -L 'localhost:15432:10.0.0.5:5432'")
  })

  it('goes through every earlier node (ProxyJump) and forwards on the last one', () => {
    const hop2 = { ...node, name: 'hop2', host: 'hop2.example.com' }
    const hop3 = { ...node, name: 'hop3', host: 'hop3.example.com' }
    const { script, config } = buildForward({ via: [node, hop2, hop3], forwards }, paths)
    const [a1, a2, a3] = aliasesOf(config)

    expect(aliasesOf(config)).toHaveLength(3)
    expect(script).toContain(`-J '${a1},${a2}'`)
    expect(script).toContain(`-L 'localhost:15432:db.internal:5432' -- '${a3}'`)
    // 포워딩 대상은 ssh 접속 대상이 아니므로 config에 들어가지 않는다.
    expect(config).not.toContain('db.internal')
  })

  it('shares host aliases with ProxyJump for the same path (known_hosts entries are reused)', () => {
    const hop2 = { ...node, name: 'hop2', host: 'hop2.example.com' }
    const forward = buildForward({ via: [node, hop2], forwards }, paths)
    const jump = buildProxyJump([node, hop2, { ...node, host: '10.0.0.5' }], paths)

    expect(aliasesOf(forward.config)).toEqual(aliasesOf(jump.config).slice(0, 2))
  })

  it('brackets an IPv6 target', () => {
    const { script } = buildForward({ via: [node], forwards: [{ checked: true, from: '15432', host: 'fe80::1', to: '5432' }] }, paths)
    expect(script).toContain("-L 'localhost:15432:[fe80::1]:5432'")
  })

  it('describes the route and every forward in the window', () => {
    const { script } = buildForward({ via: [node, { ...node, name: 'inner', host: 'inner.example.com' }], forwards }, paths)
    expect(script).toContain('deploy@example.com:22 (web) -> deploy@inner.example.com:22 (inner)')
    expect(script).toContain('localhost:15432 -> db.internal:5432  (as seen from inner)')
  })

  it('needs a node to connect through and something to forward', () => {
    expect(() => buildForward({ via: [], forwards }, paths)).toThrow()
    expect(() => buildForward({ forwards }, paths)).toThrow()
    expect(() => buildForward({ via: [node], forwards: [] }, paths)).toThrow()
    expect(() => buildForward({ via: [node], forwards: [{ checked: true, from: '1', to: '' }] }, paths)).toThrow()
  })

  it('rejects hostile target hosts and duplicate local ports', () => {
    expect(() => buildForward({ via: [node], forwards: [{ checked: true, from: '1', host: "x'; rm -rf ~; '", to: '2' }] }, paths)).toThrow()
    expect(() => buildForward({ via: [node], forwards: [{ checked: true, from: '1', host: '-oProxyCommand=x', to: '2' }] }, paths)).toThrow()
    expect(() => buildForward({
      via: [node],
      forwards: [{ checked: true, from: '1', to: '2' }, { checked: true, from: '1', to: '3' }]
    }, paths)).toThrow()
  })

  it('does not need explicit auth on the hops (ssh-agent / default keys / prompts are fine)', () => {
    expect(() => buildForward({ via: [{ ...node, keyPath: '' }], forwards }, paths)).not.toThrow()
  })
})

describe('password auth', () => {
  const withPw = { ...node, keyPath: '', password: "S3cr3t'x $y\"" }

  it('answers only password prompts and passes the secret through the environment', () => {
    const { script, env } = buildConnect(withPw, paths)

    expect(env).toEqual({ JS_PW_0: withPw.password })
    expect(script).not.toContain('S3cr3t') // the secret itself is never written into the script
    // password 방식("user@host's password:")과 keyboard-interactive 방식("(user@host) Password:") 둘 다 답한다.
    expect(script).toContain("'deploy@example.com'\\''s password:'*|'(deploy@example.com) '[Pp]assword:*) printf '%s\\n' \"$JS_PW_0\" ;;")
    expect(script).toContain('export SSH_ASKPASS="$0" SSH_ASKPASS_REQUIRE=force')
    expect(script).toContain('-o NumberOfPasswordPrompts=1 -o PubkeyAuthentication=no')
    // askpass branch must run before the cleanup trap, otherwise every prompt would delete the script
    expect(script.indexOf('SSH_ASKPASS_REQUIRE')).toBeLessThan(script.indexOf('trap cleanup'))
    expect(script.indexOf('if [ "$#" -gt 0 ]')).toBeLessThan(script.indexOf('trap cleanup'))
    // 닫힌 창/탭에서 남은 명령(오류 안내 후 read 등)을 계속 실행하지 않는다.
    expect(script).toContain("trap 'exit 129' HUP")
    expect(script).toContain("trap 'exit 143' TERM")
  })

  it('keeps public key auth when a key is set too', () => {
    const { script } = buildConnect({ ...withPw, keyPath: 'C:\\k' }, paths)
    expect(script).toContain('-o NumberOfPasswordPrompts=1')
    expect(script).not.toContain('PubkeyAuthentication=no')
  })

  it('does not use askpass without a password', () => {
    const { script, env } = buildConnect(node, paths)
    expect(env).toEqual({})
    expect(script).not.toContain('SSH_ASKPASS')
  })

  it('forwards through a password-only node', () => {
    const { script, config, env } = buildForward({
      via: [withPw],
      forwards: [{ checked: true, from: '1', to: '2' }]
    }, paths)
    const [alias] = aliasesOf(config)

    expect(env).toEqual({ JS_PW_0: withPw.password })
    expect(script).toContain(`'deploy@${alias}'\\''s password:'*`)
    expect(blocksOf(config)[alias]).toContain('PubkeyAuthentication no')
  })

  it('supports a different password per hop', () => {
    const { script, config, env } = buildProxyJump([
      { ...node, password: 'one' },
      { ...node, host: '10.0.0.5', user: 'root', keyPath: '', password: 'two' }
    ], paths)

    expect(env).toEqual({ JS_PW_0: 'one', JS_PW_1: 'two' })
    // ProxyJump에서 ssh는 Host 별칭(해시)으로 접속하므로 prompt에도 별칭이 나온다.
    const aliases = aliasesOf(config)
    expect(script).toContain(`'deploy@${aliases[0]}'\\''s password:'*|'(deploy@${aliases[0]}) '[Pp]assword:*) printf '%s\\n' "$JS_PW_0"`)
    expect(script).toContain(`'root@${aliases[1]}'\\''s password:'*|'(root@${aliases[1]}) '[Pp]assword:*) printf '%s\\n' "$JS_PW_1"`)
    expect(config).toContain('PubkeyAuthentication no')
    expect(config.match(/NumberOfPasswordPrompts 1/g)).toHaveLength(2)
  })
})

// 경로의 노드마다 인증 방식이 다른 경우: 키 / 비밀번호 / 키+비밀번호 / 인증 정보 없음(ssh-agent, 기본 키)
describe('a different authentication per hop', () => {
  const keyHop = { name: 'key', user: 'kate', host: 'a.example.com', port: '22', keyPath: 'C:\\keys\\a' }
  const pwHop = { name: 'pw', user: 'paul', host: 'b.example.com', port: '2222', password: 'pw-secret' }
  const bothHop = { name: 'both', user: 'bob', host: 'c.example.com', port: '22', keyPath: '/keys/c', password: 'both-secret' }
  const bareHop = { name: 'bare', user: 'ann', host: 'd.example.com', port: '22' }
  const chain = [keyHop, pwHop, bothHop, bareHop]

  const expectPerHopAuth = (config, env, aliases) => {
    const blocks = blocksOf(config)
    const [key, pw, both, bare] = aliases.map(alias => blocks[alias])

    expect(key).toContain('IdentityFile "C:/keys/a"')
    expect(key).toContain('IdentitiesOnly yes')
    expect(key.join('\n')).not.toMatch(/NumberOfPasswordPrompts|PubkeyAuthentication/)

    expect(pw).toContain('NumberOfPasswordPrompts 1')
    expect(pw).toContain('PubkeyAuthentication no')
    expect(pw.join('\n')).not.toMatch(/IdentityFile|IdentitiesOnly/)

    // 키와 비밀번호가 둘 다 있으면 키를 먼저 쓰고(공개키 인증을 끄지 않는다) 비밀번호를 이어서 쓴다.
    expect(both).toContain('IdentityFile "/keys/c"')
    expect(both).toContain('IdentitiesOnly yes')
    expect(both).toContain('NumberOfPasswordPrompts 1')
    expect(both).not.toContain('PubkeyAuthentication no')

    // 인증 정보가 없으면 ssh 기본 동작(agent, ~/.ssh의 기본 키, 터미널 입력)에 맡긴다.
    expect(bare.join('\n')).not.toMatch(/IdentityFile|IdentitiesOnly|NumberOfPasswordPrompts|PubkeyAuthentication/)

    // 비밀번호는 비밀번호가 있는 노드의 순번(JS_PW_<index>)으로만 넘어간다.
    expect(env).toEqual({ JS_PW_1: 'pw-secret', JS_PW_2: 'both-secret' })
  }

  it('ProxyJump writes each hop its own auth', () => {
    const { config, env } = buildProxyJump(chain, paths)
    expectPerHopAuth(config, env, aliasesOf(config))
  })

  it('Forward through the same hops uses the same per-hop auth', () => {
    const { config, env } = buildForward({
      via: chain,
      forwards: [{ checked: true, from: '1000', host: '10.0.0.9', to: '2000' }]
    }, paths)
    expectPerHopAuth(config, env, aliasesOf(config))
  })

  it('copies the same hops as an ssh config (without passwords)', () => {
    const config = buildSshConfig(chain)
    expect(config).toContain('IdentityFile "C:/keys/a"')
    expect(config).not.toContain('secret')
  })
})

describe('buildProxyJump', () => {
  const nodes = [node, { ...node, name: 'inner', host: '10.0.0.5', keyPath: 'D:\\keys\\my key' }]

  it('builds config and jump chain', () => {
    const { script, config } = buildProxyJump(nodes, paths)
    const hosts = [...config.matchAll(/^Host (\w+)$/gm)].map(x => x[1])

    expect(hosts).toHaveLength(2)
    expect(config).toContain('IdentityFile "C:/Users/me/.ssh/id_rsa"')
    expect(config).toContain('IdentityFile "D:/keys/my key"')
    expect(config.match(/IdentitiesOnly yes/g)).toHaveLength(2)
    expect(config).not.toContain('\r')
    expect(script).toContain(`-F 'C:/tmp/jumpspace/a.jmp' -J '${hosts[0]}' -- '${hosts[1]}'`)
    expect(script).toContain("rm -f -- 'C:/tmp/jumpspace/a.sh' 'C:/tmp/jumpspace/a.jmp'")
  })

  it('uses the same host aliases as previous versions (known_hosts compatible)', () => {
    const md5 = value => createHash('md5').update(value).digest('hex')
    const first = md5(md5('') + 'example.com' + 'deploy' + '22')
    const second = md5(md5(first) + '10.0.0.5' + 'deploy' + '22')

    const { config } = buildProxyJump(nodes, paths)
    expect([...config.matchAll(/^Host (\w+)$/gm)].map(x => x[1])).toEqual([first, second])
  })

  it('skips IdentityFile when a node has no key', () => {
    const { config } = buildProxyJump([node, { ...node, keyPath: '' }], paths)
    expect(config.match(/IdentityFile/g)).toHaveLength(1)
  })

  it('needs at least two nodes', () => {
    expect(() => buildProxyJump([node], paths)).toThrow()
  })
})

describe('toUnixPath', () => {
  it('turns Windows separators into slashes so bash can read the path', () => {
    expect(toUnixPath('C:\\Users\\me\\AppData\\Local\\Temp\\jumpspace\\a.sh')).toBe('C:/Users/me/AppData/Local/Temp/jumpspace/a.sh')
  })

  it('leaves a path that already uses slashes, and accepts non-strings', () => {
    expect(toUnixPath('/tmp/a b/c.sh')).toBe('/tmp/a b/c.sh')
    expect(toUnixPath(12)).toBe('12')
  })
})

describe('bracketHost', () => {
  it('wraps an IPv6 address so the port after it stays readable', () => {
    expect(bracketHost('::1')).toBe('[::1]')
    expect(bracketHost('fe80::1234:5678')).toBe('[fe80::1234:5678]')
  })

  it('leaves names, IPv4 addresses and already bracketed addresses alone', () => {
    expect(bracketHost('example.com')).toBe('example.com')
    expect(bracketHost('10.0.0.5')).toBe('10.0.0.5')
    expect(bracketHost('[::1]')).toBe('[::1]')
  })
})
