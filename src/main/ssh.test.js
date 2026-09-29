import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildConnect, buildForward, buildProxyJump, sq } from './ssh.js'

const paths = { scriptPath: 'C:/tmp/jumpspace/a.sh', configPath: 'C:/tmp/jumpspace/a.jmp' }
const node = { name: 'web', user: 'deploy', host: 'example.com', port: '22', keyPath: 'C:\\Users\\me\\.ssh\\id_rsa', exec: '' }

describe('sq', () => {
  it('escapes single quotes', () => {
    expect(sq("it's")).toBe("'it'\\''s'")
    expect(sq('a b')).toBe("'a b'")
  })
})

describe('buildConnect', () => {
  it('builds ssh command', () => {
    const script = buildConnect(node, paths).script
    expect(script).toContain("ssh -o StrictHostKeyChecking=accept-new -i 'C:/Users/me/.ssh/id_rsa' -p '22' -- 'deploy@example.com'")
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
    expect(buildConnect({ ...node, keyPath: '' }, paths).script).not.toContain(' -i ')
  })

  it('rejects options injected through host', () => {
    expect(() => buildConnect({ ...node, host: '-oProxyCommand=calc' }, paths).script).toThrow()
  })

  it('removes its own script when finished', () => {
    expect(buildConnect(node, paths).script).toContain("rm -f -- 'C:/tmp/jumpspace/a.sh'")
  })
})

describe('buildForward', () => {
  it('builds -L options through the previous node', () => {
    const script = buildForward({
      prev: node,
      node: { ...node, host: '10.0.0.5', name: 'db' },
      forwards: [{ checked: true, from: '15432', to: '5432' }, { checked: false, from: '1', to: '2' }]
    }, paths).script

    expect(script).toContain("-N -L 'localhost:15432:10.0.0.5:5432' -- 'deploy@example.com'")
    expect(script).not.toContain(':1:')
  })

  it('requires a key or password for the previous node', () => {
    expect(() => buildForward({
      prev: { ...node, keyPath: '' },
      node,
      forwards: [{ checked: true, from: '1', to: '2' }]
    }, paths).script).toThrow()
  })
})

describe('password auth', () => {
  const withPw = { ...node, keyPath: '', password: "S3cr3t'x $y\"" }

  it('answers only password prompts and passes the secret through the environment', () => {
    const { script, env } = buildConnect(withPw, paths)

    expect(env).toEqual({ JS_PW_0: withPw.password })
    expect(script).not.toContain('S3cr3t') // the secret itself is never written into the script
    expect(script).toContain("'deploy@example.com'\\''s password:'*) printf '%s\\n' \"$JS_PW_0\" ;;")
    expect(script).toContain('export SSH_ASKPASS="$0" SSH_ASKPASS_REQUIRE=force')
    expect(script).toContain('-o NumberOfPasswordPrompts=1 -o PubkeyAuthentication=no')
    // askpass branch must run before the cleanup trap, otherwise every prompt would delete the script
    expect(script.indexOf('SSH_ASKPASS_REQUIRE')).toBeLessThan(script.indexOf('trap cleanup'))
    expect(script.indexOf('if [ "$#" -gt 0 ]')).toBeLessThan(script.indexOf('trap cleanup'))
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

  it('forwards through a password-only previous node', () => {
    const { script, env } = buildForward({
      prev: withPw,
      node: { ...node, host: '10.0.0.5' },
      forwards: [{ checked: true, from: '1', to: '2' }]
    }, paths)

    expect(env).toEqual({ JS_PW_0: withPw.password })
    expect(script).not.toContain(' -i ')
  })

  it('supports a different password per hop', () => {
    const { script, config, env } = buildProxyJump([
      { ...node, password: 'one' },
      { ...node, host: '10.0.0.5', user: 'root', keyPath: '', password: 'two' }
    ], paths)

    expect(env).toEqual({ JS_PW_0: 'one', JS_PW_1: 'two' })
    // ProxyJump에서 ssh는 Host 별칭(해시)으로 접속하므로 prompt에도 별칭이 나온다.
    const aliases = [...config.matchAll(/^Host (\w+)$/gm)].map(x => x[1])
    expect(script).toContain(`'deploy@${aliases[0]}'\\''s password:'*) printf '%s\\n' "$JS_PW_0"`)
    expect(script).toContain(`'root@${aliases[1]}'\\''s password:'*) printf '%s\\n' "$JS_PW_1"`)
    expect(config).toContain('PubkeyAuthentication no')
    expect(config.match(/NumberOfPasswordPrompts 1/g)).toHaveLength(2)
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
