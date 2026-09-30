import { describe, expect, it } from 'vitest'
import { buildSshConfig } from './ssh-config.js'

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
})
