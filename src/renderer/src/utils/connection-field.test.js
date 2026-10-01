import { describe, expect, it } from 'vitest'
import { fieldError } from './connection-field'

describe('fieldError', () => {
  it('accepts valid values and says nothing about empty ones', () => {
    expect(fieldError('user', 'deploy')).toBeNull()
    expect(fieldError('user', 'DOMAIN\\me')).toBeNull()
    expect(fieldError('host', 'db-1.example.internal')).toBeNull()
    expect(fieldError('host', '[fe80::1%eth0]')).toBeNull()
    expect(fieldError('port', '22')).toBeNull()
    expect(fieldError('keyPath', 'C:\\Users\\me\\.ssh\\id_ed25519')).toBeNull()
    expect(fieldError('exec', 'tail -f /var/log/syslog; echo "done"')).toBeNull()
    for (const key of ['user', 'host', 'port', 'keyPath', 'exec']) {
      expect(fieldError(key, '')).toBeNull()
      expect(fieldError(key, '   ')).toBeNull()
      expect(fieldError(key, undefined)).toBeNull()
    }
  })

  it('explains what is wrong with values the launch would reject', () => {
    expect(fieldError('user', 'bad user')).toMatch(/no spaces/)
    expect(fieldError('user', '-oProxyCommand=x')).toMatch(/not - first/)
    expect(fieldError('host', 'bad host;rm')).toMatch(/no spaces/)
    expect(fieldError('host', '-oProxyCommand=x')).toMatch(/not - first/)
    expect(fieldError('port', '99999')).toMatch(/1 and 65535/)
    expect(fieldError('port', 'ssh')).toMatch(/1 and 65535/)
    expect(fieldError('keyPath', 'a"b')).toMatch(/No "/)
    expect(fieldError('exec', 'x'.repeat(4097))).toMatch(/4096/)
  })

  it('does not repeat the value in the message', () => {
    expect(fieldError('host', 'secret host')).not.toContain('secret')
  })

  it('ignores fields without a rule', () => {
    expect(fieldError('name', 'any; thing')).toBeNull()
    expect(fieldError('password', 'p w')).toBeNull()
  })
})
