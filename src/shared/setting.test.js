import { describe, expect, it } from 'vitest'
import { BACKDROPS, DEFAULT_SETTING, NODE_BLUR_MAX, normalizeSetting, TERMINAL_COLORS, TERMINAL_FONT_SIZE_MAX, TERMINAL_FONT_SIZE_MIN, THEMES } from './setting.js'

describe('normalizeSetting', () => {
  it('keeps valid values', () => {
    expect(normalizeSetting({ gitBashPath: 'D:\\Git\\git-bash.exe', isHideToTrayOnClose: true, openIn: 'window', theme: 'vapor-blue', backdrop: 'crt', terminalColors: 'muted', nodeBlur: 12, terminalFontSize: 16, hideNodeInfo: true }))
      .toEqual({ gitBashPath: 'D:\\Git\\git-bash.exe', isHideToTrayOnClose: true, openIn: 'window', theme: 'vapor-blue', backdrop: 'crt', terminalColors: 'muted', nodeBlur: 12, terminalFontSize: 16, hideNodeInfo: true })
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

describe('normalizeSetting: backdrop', () => {
  it('blurs the background scene by default and accepts only known effects', () => {
    expect(normalizeSetting({}).backdrop).toBe('depth')
    for (const backdrop of BACKDROPS) {
      expect(normalizeSetting({ backdrop }).backdrop).toBe(backdrop)
    }
    expect(normalizeSetting({ backdrop: 'x" onload="y' }).backdrop).toBe('depth')
    expect(normalizeSetting({ backdrop: 3 }).backdrop).toBe('depth')
  })
})

describe('normalizeSetting: terminalColors', () => {
  // 이 설정이 없던 때의 파일에는 키가 없다: 그때도 조금 낮춘 색이다.
  it('tones the terminal colors down a little by default and accepts only known levels', () => {
    expect(TERMINAL_COLORS).toEqual(['vivid', 'soft', 'muted'])
    expect(DEFAULT_SETTING.terminalColors).toBe('soft')
    expect(normalizeSetting({}).terminalColors).toBe('soft')
    for (const terminalColors of TERMINAL_COLORS) {
      expect(normalizeSetting({ terminalColors }).terminalColors).toBe(terminalColors)
    }
    for (const terminalColors of ['Vivid', 'toString', '#3dff8a', '', null, 2, ['vivid'], {}]) {
      expect(normalizeSetting({ terminalColors }).terminalColors, String(terminalColors)).toBe('soft')
    }
  })
})

describe('normalizeSetting: terminalFontSize', () => {
  it('is 13 by default, also for a setting file from before the key', () => {
    expect(DEFAULT_SETTING.terminalFontSize).toBe(13)
    expect(normalizeSetting({}).terminalFontSize).toBe(13)
    expect(normalizeSetting({ terminalFontSize: 'big' }).terminalFontSize).toBe(13)
    expect(normalizeSetting({ terminalFontSize: null }).terminalFontSize).toBe(13)
    expect(normalizeSetting({ terminalFontSize: NaN }).terminalFontSize).toBe(13)
    // Number('')와 Number(' ')는 0이다: 비었거나 공백뿐인 글자는 숫자가 아니라서 가장 작은 크기가 되지 않는다
    expect(normalizeSetting({ terminalFontSize: '' }).terminalFontSize).toBe(13)
    expect(normalizeSetting({ terminalFontSize: ' \t' }).terminalFontSize).toBe(13)
  })

  it('keeps whole sizes inside its range', () => {
    expect(normalizeSetting({ terminalFontSize: 18 }).terminalFontSize).toBe(18)
    expect(normalizeSetting({ terminalFontSize: '15' }).terminalFontSize).toBe(15)
    expect(normalizeSetting({ terminalFontSize: 14.4 }).terminalFontSize).toBe(14)
    expect(normalizeSetting({ terminalFontSize: 2 }).terminalFontSize).toBe(TERMINAL_FONT_SIZE_MIN)
    expect(normalizeSetting({ terminalFontSize: 500 }).terminalFontSize).toBe(TERMINAL_FONT_SIZE_MAX)
    expect([TERMINAL_FONT_SIZE_MIN, TERMINAL_FONT_SIZE_MAX]).toEqual([8, 32])
  })
})

describe('normalizeSetting: nodeBlur', () => {
  it('is off (0) by default', () => {
    expect(normalizeSetting({}).nodeBlur).toBe(0)
    expect(DEFAULT_SETTING.nodeBlur).toBe(0)
  })

  it('keeps whole pixels inside the range, also from a string (range input)', () => {
    expect(normalizeSetting({ nodeBlur: 8 }).nodeBlur).toBe(8)
    expect(normalizeSetting({ nodeBlur: '14' }).nodeBlur).toBe(14)
    expect(normalizeSetting({ nodeBlur: 6.6 }).nodeBlur).toBe(7)
  })

  it('clamps to 0..max and falls back to 0 for anything else', () => {
    expect(normalizeSetting({ nodeBlur: -3 }).nodeBlur).toBe(0)
    expect(normalizeSetting({ nodeBlur: 999 }).nodeBlur).toBe(NODE_BLUR_MAX)
    for (const nodeBlur of [null, undefined, '', 'blur(9px)', NaN, Infinity, {}, true]) {
      expect(normalizeSetting({ nodeBlur }).nodeBlur).toBe(0)
    }
  })
})

describe('normalizeSetting: hideNodeInfo', () => {
  it('is off unless it is exactly true (older settings have no such key)', () => {
    expect(DEFAULT_SETTING.hideNodeInfo).toBe(false)
    expect(normalizeSetting({}).hideNodeInfo).toBe(false)
    expect(normalizeSetting({ hideNodeInfo: true }).hideNodeInfo).toBe(true)
    for (const value of ['true', 1, 'yes', null, {}]) {
      expect(normalizeSetting({ hideNodeInfo: value }).hideNodeInfo).toBe(false)
    }
  })
})
