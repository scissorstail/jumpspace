import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTING, normalizeSetting, THEMES } from './setting.js'

describe('normalizeSetting', () => {
  it('keeps valid values', () => {
    expect(normalizeSetting({ gitBashPath: 'D:\\Git\\git-bash.exe', isHideToTrayOnClose: true, openIn: 'window', theme: 'vapor-blue' }))
      .toEqual({ gitBashPath: 'D:\\Git\\git-bash.exe', isHideToTrayOnClose: true, openIn: 'window', theme: 'vapor-blue' })
  })

  it('uses the default path when it is empty, blank or not a string', () => {
    for (const gitBashPath of ['', '   ', null, undefined, 5, {}]) {
      expect(normalizeSetting({ gitBashPath }).gitBashPath).toBe(DEFAULT_SETTING.gitBashPath)
    }
  })

  it('trims the path', () => {
    expect(normalizeSetting({ gitBashPath: '  C:\\Git\\git-bash.exe ' }).gitBashPath).toBe('C:\\Git\\git-bash.exe')
  })

  it('falls back to the defaults for missing or odd input', () => {
    expect(normalizeSetting(undefined)).toEqual(DEFAULT_SETTING)
    expect(normalizeSetting(null)).toEqual(DEFAULT_SETTING)
    expect(normalizeSetting('nope')).toEqual(DEFAULT_SETTING)
    expect(normalizeSetting({})).toEqual(DEFAULT_SETTING)
  })

  it('turns the tray option into a boolean and drops unknown keys', () => {
    expect(normalizeSetting({ isHideToTrayOnClose: 1 }).isHideToTrayOnClose).toBe(true)
    expect(normalizeSetting({ isHideToTrayOnClose: 0 }).isHideToTrayOnClose).toBe(false)
    expect(normalizeSetting({ evil: 'x' })).toEqual(DEFAULT_SETTING)
  })
})

describe('normalizeSetting: openIn', () => {
  it('opens sessions in the app by default and accepts only known places', () => {
    expect(normalizeSetting({}).openIn).toBe('app')
    expect(normalizeSetting({ openIn: 'window' }).openIn).toBe('window')
    expect(normalizeSetting({ openIn: 'app' }).openIn).toBe('app')
    expect(normalizeSetting({ openIn: 'cmd.exe' }).openIn).toBe('app')
    expect(normalizeSetting({ openIn: 1 }).openIn).toBe('app')
  })
})

describe('normalizeSetting: theme', () => {
  it('uses the neon night colors by default and accepts only known themes', () => {
    expect(normalizeSetting({}).theme).toBe('neon-night')
    for (const theme of THEMES) {
      expect(normalizeSetting({ theme }).theme).toBe(theme)
    }
    expect(normalizeSetting({ theme: 'url(javascript:x)' }).theme).toBe('neon-night')
    expect(normalizeSetting({ theme: null }).theme).toBe('neon-night')
  })
})
