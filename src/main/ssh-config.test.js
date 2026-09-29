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
