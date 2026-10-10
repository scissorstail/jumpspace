import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { THEMES } from '../../../shared/setting.js'
import { endedLine, errorLine, MAXIMIZE_SNAP, MIN_CANVAS_HEIGHT, MIN_PANEL_HEIGHT, panelDrag, panelHeight, RECONNECTING_LINE, revealScrollLeft, sessionStatusText, terminalCountText, terminalTheme } from './terminal-view'

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

describe('terminalCountText', () => {
  it('names the number next to a diagram in the list', () => {
    expect(terminalCountText(1)).toBe('1 terminal open')
    expect(terminalCountText(3)).toBe('3 terminals open')
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
    // 커서는 글자색, 그 아래 글자는 바탕색 (터미널의 기본). 색 묶음의 주색(#f0f)을 쓰지 않는다.
    expect(theme).toMatchObject({ background: '#000', foreground: '#fff', cursor: '#fff', cursorAccent: '#000', red: '#f00', green: '#0f0', yellow: '#ff0', magenta: '#f0e', cyan: '#0fe', brightBlack: '#999' })
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

describe('panelHeight', () => {
  it('keeps the height the user chose while there is room', () => {
    expect(panelHeight(280, 800)).toBe(280)
    expect(panelHeight(280, Infinity)).toBe(280)
  })

  // 창이 낮아지면 캔버스가 사라지지 않게 패널이 줄어든다.
  it('shrinks in a low window so the canvas keeps its minimum', () => {
    expect(panelHeight(280, 400)).toBe(400 - MIN_CANVAS_HEIGHT)
    expect(panelHeight(600, 500)).toBe(500 - MIN_CANVAS_HEIGHT)
  })

  it('never gets lower than its own minimum', () => {
    expect(panelHeight(280, 150)).toBe(MIN_PANEL_HEIGHT)
    expect(panelHeight(20, 800)).toBe(MIN_PANEL_HEIGHT)
  })
})

// 위쪽 가장자리를 끌 때: 캔버스를 남기는 높이에서 멈추고, 거기서 더 끌어 올리면 최대화한다.
describe('panelDrag', () => {
  const available = 800
  const tallest = available - MIN_CANVAS_HEIGHT

  it('follows the mouse and stops where the canvas keeps its minimum', () => {
    expect(panelDrag(300, available)).toEqual({ maximized: false, height: 300 })
    expect(panelDrag(20, available)).toEqual({ maximized: false, height: MIN_PANEL_HEIGHT })
    expect(panelDrag(tallest + 30, available)).toEqual({ maximized: false, height: tallest })
    expect(panelDrag(tallest + MAXIMIZE_SNAP, available)).toEqual({ maximized: false, height: tallest })
  })

  it('maximizes when dragged further up than the snap distance', () => {
    expect(panelDrag(tallest + MAXIMIZE_SNAP + 1, available).maximized).toBe(true)
    expect(panelDrag(available + 50, available).maximized).toBe(true)
  })

  // 최대화한 패널(높이 = available)을 끌어 내릴 때도 같은 자리에서 풀린다.
  it('lets go at the same place when a maximized panel is dragged down', () => {
    expect(panelDrag(available - 10, available).maximized).toBe(true)
    expect(panelDrag(tallest + MAXIMIZE_SNAP, available)).toEqual({ maximized: false, height: tallest })
    expect(panelDrag(350, available)).toEqual({ maximized: false, height: 350 })
  })

  // 창이 낮아서 패널이 이미 최소 높이일 때: 건드리기만 해서는 최대화하지 않는다.
  it('needs the same extra drag in a low window', () => {
    expect(panelDrag(MIN_PANEL_HEIGHT, 300)).toEqual({ maximized: false, height: MIN_PANEL_HEIGHT })
    expect(panelDrag(MIN_PANEL_HEIGHT - 60, 300).maximized).toBe(false)
    expect(panelDrag(MIN_PANEL_HEIGHT + MAXIMIZE_SNAP, 300).maximized).toBe(false)
    expect(panelDrag(MIN_PANEL_HEIGHT + MAXIMIZE_SNAP + 1, 300).maximized).toBe(true)
  })

  it('never maximizes before the available height is known', () => {
    expect(panelDrag(5000, Infinity)).toEqual({ maximized: false, height: 5000 })
  })
})

describe('revealScrollLeft', () => {
  const view = { scrollLeft: 100, width: 300 } // 100..400이 보인다

  it('leaves the list alone when the tab is already visible', () => {
    expect(revealScrollLeft(view, { left: 100, width: 150 })).toBe(100)
    expect(revealScrollLeft(view, { left: 250, width: 150 })).toBe(100)
  })

  it('scrolls just far enough to show a tab on the right or the left', () => {
    expect(revealScrollLeft(view, { left: 380, width: 150 })).toBe(230)
    expect(revealScrollLeft(view, { left: 1000, width: 150 })).toBe(850)
    expect(revealScrollLeft(view, { left: 40, width: 150 })).toBe(40)
    expect(revealScrollLeft({ scrollLeft: 0, width: 300 }, { left: 0, width: 150 })).toBe(0)
  })

  it('shows the start of a tab wider than the list', () => {
    expect(revealScrollLeft(view, { left: 500, width: 400 })).toBe(500)
  })
})
