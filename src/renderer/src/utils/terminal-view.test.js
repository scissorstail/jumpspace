import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { THEMES } from '../../../shared/setting.js'
import { endedLine, errorLine, RECONNECTING_LINE, sessionStatusText, terminalTheme } from './terminal-view'

describe('sessionStatusText', () => {
  it('names every state and gives the exit status of a failed end', () => {
    expect(sessionStatusText({ status: 'starting' })).toBe('Starting')
    expect(sessionStatusText({ status: 'running' })).toBe('Connecting (not logged in yet)')
    expect(sessionStatusText({ status: 'running', connected: true })).toBe('Connected')
    expect(sessionStatusText({ status: 'exited', exitCode: 0 })).toBe('Ended')
    expect(sessionStatusText({ status: 'exited', exitCode: 255 })).toBe('Ended (exit status 255)')
    expect(sessionStatusText({ status: 'failed' })).toBe('Could not start')
    expect(sessionStatusText(null)).toBeUndefined()
  })
})

describe('terminal lines', () => {
  it('says how to reconnect, with the exit status only when it is not 0', () => {
    expect(endedLine(0)).toBe('\r\n\x1b[90m[session ended] Press Enter to reconnect.\x1b[0m\r\n')
    expect(endedLine(255)).toContain('[session ended, exit status 255] Press Enter to reconnect.')
    expect(RECONNECTING_LINE).toContain('[reconnecting]')
  })

  it('writes errors in red with terminal line breaks', () => {
    expect(errorLine('bash.exe was not found\nCheck Settings')).toBe('\x1b[31mbash.exe was not found\r\nCheck Settings\x1b[0m\r\n')
    expect(errorLine('a\r\nb')).toBe('\x1b[31ma\r\nb\x1b[0m\r\n')
  })
})

describe('terminalTheme', () => {
  it('maps the theme variables to xterm colors', () => {
    const vars = { '--js-bg': '#000', '--js-text': '#fff', '--js-primary': '#f0f', '--js-line': '#333', '--js-danger': '#f00', '--js-live': '#0f0', '--js-connecting': '#ff0', '--js-sun': '#a0f', '--js-secondary': '#0ff', '--js-ansi-magenta': '#f0e', '--js-ansi-cyan': '#0fe', '--js-text-muted': '#999' }
    const theme = terminalTheme(name => vars[name])
    expect(theme).toMatchObject({ background: '#000', foreground: '#fff', cursor: '#f0f', cursorAccent: '#000', red: '#f00', green: '#0f0', yellow: '#ff0', magenta: '#f0e', cyan: '#0fe', brightBlack: '#999' })
    expect(Object.values(theme).every(Boolean)).toBe(true)
  })
})

// theme.scss의 실제 색 묶음에서 터미널 색을 만든다. (공통 :root 블록 위에 색 묶음 블록을 덮는다)
function paletteVars(theme) {
  const scss = readFileSync(new URL('../assets/theme.scss', import.meta.url), 'utf8')
  const blocks = [...scss.matchAll(/^(:root[^{]*)\{([^}]*)\}/gm)].map(([, selector, body]) => ({
    selector,
    vars: Object.fromEntries([...body.replace(/\/\/.*$/gm, '').matchAll(/(--js-[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]))
  }))
  const shared = blocks.find(b => b.selector.trim() === ':root').vars
  const own = blocks.find(b => b.selector.includes(`'${theme}'`)).vars
  const vars = { ...shared, ...own }
  const resolve = value => value.replace(/var\((--js-[\w-]+)\)/g, (_, name) => resolve(vars[name]))
  return name => resolve(vars[name])
}

function hue(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (!d) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

describe('terminal colors of every palette', () => {
  it.each(THEMES)('%s keeps the six ANSI colors apart', theme => {
    const t = terminalTheme(paletteVars(theme))
    const names = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']
    for (const name of names) expect(t[name], `${theme} ${name}`).toMatch(/^#[0-9a-f]{6}$/i)
    for (const [i, a] of names.entries()) {
      for (const b of names.slice(i + 1)) {
        const d = Math.abs(hue(t[a]) - hue(t[b]))
        expect(Math.min(d, 360 - d), `${theme}: ${a} ${t[a]} vs ${b} ${t[b]}`).toBeGreaterThanOrEqual(15)
      }
    }
  })
})
