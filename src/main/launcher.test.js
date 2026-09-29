import { describe, expect, it } from 'vitest'
import { expandEnv } from './launcher.js'

describe('expandEnv', () => {
  it('expands %VAR% and keeps unknown ones', () => {
    expect(expandEnv('%ProgramFiles%\\Git\\git-bash.exe', { ProgramFiles: 'C:\\Program Files' }))
      .toBe('C:\\Program Files\\Git\\git-bash.exe')
    expect(expandEnv('%NOPE%\\x', {})).toBe('%NOPE%\\x')
  })
})
