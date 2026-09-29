import { describe, expect, it } from 'vitest'
import { validateExec, validateForwards, validateHost, validateKeyPath, validateNode, validatePort, validateUser } from './validate.js'

describe('validate', () => {
  it('accepts normal values', () => {
    expect(validateHost(' example.com ')).toBe('example.com')
    expect(validateHost('192.168.0.1')).toBe('192.168.0.1')
    expect(validateHost('[fe80::1]')).toBe('[fe80::1]')
    expect(validateUser('deploy')).toBe('deploy')
    expect(validateUser('DOMAIN\\user.name')).toBe('DOMAIN\\user.name')
    expect(validatePort('22')).toBe('22')
    expect(validatePort(2222)).toBe('2222')
  })

  it.each([
    '-oProxyCommand=calc',
    'a b',
    "a'b",
    'a;b',
    'a\nb',
    '$(id)',
    ''
  ])('rejects host %j', value => {
    expect(() => validateHost(value)).toThrow()
  })

  it.each(['-l', 'a b', "a'b", '', 'a$(id)'])('rejects user %j', value => {
    expect(() => validateUser(value)).toThrow()
  })

  it.each(['0', '65536', '22a', '', ' ', '-1', '1e3', null, undefined])('rejects port %j', value => {
    expect(() => validatePort(value)).toThrow()
  })

  it('validates key path', () => {
    expect(validateKeyPath('')).toBe('')
    expect(() => validateKeyPath('', { required: true })).toThrow()
    expect(validateKeyPath("C:\\Users\\o'brien\\.ssh\\id rsa")).toBe("C:\\Users\\o'brien\\.ssh\\id rsa")
    expect(() => validateKeyPath('a"b')).toThrow()
    expect(() => validateKeyPath('a\nb')).toThrow()
  })

  it('validates exec', () => {
    expect(validateExec(' cd /var/log; ls ')).toBe('cd /var/log; ls')
    expect(validateExec(undefined)).toBe('')
    expect(() => validateExec('a\u0000b')).toThrow()
  })

  it('validates node and forwards', () => {
    expect(validateNode({ name: 'a\nb', user: 'u', host: 'h', port: '22' }).name).toBe('a b')
    expect(() => validateNode(null)).toThrow()
    expect(() => validateNode({ user: 'u', host: 'h', port: '22' }, { requireKey: true })).toThrow()

    expect(validateForwards([
      { checked: true, from: '8080', to: '80' },
      { checked: false, from: '1', to: '1' },
      { checked: true, from: '', to: '80' }
    ])).toEqual([{ from: '8080', to: '80' }])
    expect(() => validateForwards([])).toThrow()
    expect(() => validateForwards([{ checked: true, from: 'x', to: '80' }])).toThrow()
  })
})
