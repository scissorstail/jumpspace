import { describe, expect, it } from 'vitest'
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
    const vars = { '--js-bg': '#000', '--js-text': '#fff', '--js-primary': '#f0f', '--js-line': '#333', '--js-danger': '#f00', '--js-sun': '#ff0', '--js-secondary': '#0ff', '--js-text-muted': '#999' }
    const theme = terminalTheme(name => vars[name])
    expect(theme).toMatchObject({ background: '#000', foreground: '#fff', cursor: '#f0f', cursorAccent: '#000', red: '#f00', yellow: '#ff0', cyan: '#0ff', brightBlack: '#999' })
    expect(Object.values(theme).every(Boolean)).toBe(true)
  })
})
