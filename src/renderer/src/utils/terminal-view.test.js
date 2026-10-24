import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TERMINAL_COLORS } from '../../../shared/setting.js'
import { toOklch } from './color'
import { closeTerminalsQuestion, endedLine, errorLine, nextFontSize, searchSeed, SEARCH_SEED_MAX, MAXIMIZE_SNAP, MIN_CANVAS_HEIGHT, MIN_PANEL_HEIGHT, panelDrag, panelHeight, RECONNECTING_LINE, revealScrollLeft, sessionRouteText, sessionStatusText, terminalCountText, terminalTheme, XTERM_COLORS } from './terminal-view'

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

describe('nextFontSize', () => {
  it('steps by one, stops at both ends and goes back to the default', () => {
    expect(nextFontSize(13, 'font-up')).toBe(14)
    expect(nextFontSize(13, 'font-down')).toBe(12)
    expect(nextFontSize(32, 'font-up')).toBe(32)
    expect(nextFontSize(8, 'font-down')).toBe(8)
    expect(nextFontSize(27, 'font-reset')).toBe(13)
    expect(nextFontSize(13, 'copy')).toBe(13)
  })
})

describe('searchSeed', () => {
  it('is the text selected inside one line, as it is', () => {
    expect(searchSeed('needle')).toBe('needle')
    expect(searchSeed(' two words ')).toBe(' two words ')
    expect(searchSeed('x'.repeat(SEARCH_SEED_MAX))).toHaveLength(200)
  })

  it('is nothing for no selection, blanks, several lines or a very long text', () => {
    expect(searchSeed('')).toBe('')
    expect(searchSeed(undefined)).toBe('')
    expect(searchSeed('   ')).toBe('')
    expect(searchSeed('one\ntwo')).toBe('')
    expect(searchSeed('one\r\ntwo')).toBe('')
    expect(searchSeed('x'.repeat(SEARCH_SEED_MAX + 1))).toBe('')
  })
})

describe('sessionRouteText', () => {
  it('counts the nodes before the last one, and says nothing for a direct session', () => {
    expect(sessionRouteText({ hops: ['u@a:22'] })).toBe('')
    expect(sessionRouteText({ hops: [] })).toBe('')
    expect(sessionRouteText(null)).toBe('')
    expect(sessionRouteText({ hops: ['u@a:22', 'u@b:22'] })).toBe(', through 1 previous node')
    expect(sessionRouteText({ hops: ['u@a:22', 'u@b:22', 'u@c:22'] })).toBe(', through 2 previous nodes')
  })

  it('names no address', () => {
    expect(sessionRouteText({ hops: ['secret@host:22', 'u@b:22'] })).not.toMatch(/secret|host/)
  })
})

describe('terminalCountText', () => {
  it('names the number next to a diagram in the list', () => {
    expect(terminalCountText(1)).toBe('1 terminal open')
    expect(terminalCountText(3)).toBe('3 terminals open')
  })
})

describe('closeTerminalsQuestion', () => {
  const tab = status => ({ status })

  it('asks nothing when no tab is opening or running: an ended or failed tab loses nothing', () => {
    expect(closeTerminalsQuestion('alpha', [])).toBe(null)
    expect(closeTerminalsQuestion('alpha')).toBe(null)
    expect(closeTerminalsQuestion('alpha', [tab('exited'), tab('failed'), tab('exited')])).toBe(null)
  })

  it('asks while one is still running or being opened, with the name of the space', () => {
    expect(closeTerminalsQuestion('alpha', [tab('running')])).toBe('Close the terminal of "alpha"? It is still running.')
    expect(closeTerminalsQuestion('', [tab('starting')])).toBe('Close the terminal of "(untitled)"? It is still running.')
  })

  it('counts the tabs and how many of them still run', () => {
    expect(closeTerminalsQuestion('alpha', [tab('running'), tab('starting')])).toBe('Close all 2 terminals of "alpha"? All of them are still running.')
    expect(closeTerminalsQuestion('alpha', [tab('running'), tab('exited'), tab('failed')])).toBe('Close all 3 terminals of "alpha"? 1 of them is still running.')
    expect(closeTerminalsQuestion('beta', [tab('running'), tab('exited'), tab('running')])).toBe('Close all 3 terminals of "beta"? 2 of them are still running.')
  })
})

describe('terminal lines', () => {
  it('says how to reconnect, with the exit status only when it is not 0', () => {
    // 맨 앞의 CAN: 끊긴 세션이 열어 둔 OSC(클립보드에 쓰는 OSC 52, #271)를 이 줄의 ESC가 끝내지 않고 버리게 한다
    expect(endedLine(0)).toBe('\x18\r\n\x1b[90m[session ended] Press Enter to reconnect.\x1b[0m\r\n')
    expect(endedLine(255)).toContain('[session ended, exit status 255] Press Enter to reconnect.')
    expect(RECONNECTING_LINE).toContain('[reconnecting]')
  })

  it('writes errors in red with terminal line breaks', () => {
    expect(errorLine('bash.exe was not found\nCheck Settings')).toBe('\x1b[31mbash.exe was not found\r\nCheck Settings\x1b[0m\r\n')
    expect(errorLine('a\r\nb')).toBe('\x1b[31ma\r\nb\x1b[0m\r\n')
  })
})

// xterm.js의 기본 색 (그 소스에서 읽는다: 패키지가 그 표를 내보내지 않는다). 열여섯 색은 DEFAULT_ANSI_COLORS의 앞부분이다.
function xtermDefaults() {
  const read = path => readFileSync(new URL(`../../../../node_modules/@xterm/xterm/src/browser/${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const table = read('Types.ts').match(/DEFAULT_ANSI_COLORS = [\s\S]*?const colors = \[([\s\S]*?)\];/)[1]
  const ansi = [...table.matchAll(/css\.toColor\('(#[0-9a-f]{6})'\)/gi)].map(m => m[1].toLowerCase())
  const service = read('services/ThemeService.ts')
  const constant = name => service.match(new RegExp(`const ${name} = css\\.toColor\\('(#[0-9a-f]{6})'\\)`, 'i'))[1].toLowerCase()
  return { ansi, background: constant('DEFAULT_BACKGROUND'), foreground: constant('DEFAULT_FOREGROUND') }
}

function hue(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (!d) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

const ANSI = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']
const bright = name => `bright${name[0].toUpperCase()}${name.slice(1)}`
const TWELVE = [...ANSI, ...ANSI.map(bright)]
// 낮춘 단계들 (vivid가 아닌 것)
const TONED = TERMINAL_COLORS.filter(level => level !== 'vivid')
// vivid는 아무 색도 정하지 않는다: 그 단계의 색은 xterm의 기본값이다
const shown = level => ({ ...XTERM_COLORS, ...terminalTheme(level) })

// WCAG의 대비 (1..21)
function contrast(a, b) {
  const luminance = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

const hueDegrees = hex => ((toOklch(hex).h * 180) / Math.PI + 360) % 360
// 8비트 색으로 맞추느라 어긋나는 만큼
const ROUNDING = 0.004

// 터미널은 어느 색 묶음에서나 xterm.js의 기본 색을 쓴다 (owner, 2026-10-24, #289).
describe('terminalTheme', () => {
  it('copies the default colors of xterm.js', () => {
    const xterm = xtermDefaults()
    const names = ['black', ...ANSI, 'white']
    const order = [...names, ...names.map(bright)]

    expect(xterm.ansi).toHaveLength(16)
    expect(order.map(name => XTERM_COLORS[name])).toEqual(xterm.ansi)
    expect(XTERM_COLORS.background).toBe(xterm.background)
    expect(XTERM_COLORS.foreground).toBe(xterm.foreground)
    expect(Object.keys(XTERM_COLORS).sort()).toEqual(['background', 'foreground', ...order].sort())
  })

  // Vivid는 xterm의 기본값 그대로다: 아무것도 정하지 않으면 xterm이 제 기본값을 쓴다 (다른 단계에서 바꾼 색도 돌아간다).
  it('sets nothing as vivid, without a level and with one it does not know', () => {
    expect(terminalTheme()).toEqual({})
    expect(terminalTheme('vivid')).toEqual({})
    for (const odd of ['', 'Soft', 'toString', 'constructor', '__proto__', null, 7]) {
      expect(terminalTheme(odd), String(odd)).toEqual({})
    }
  })

  // 바탕, 글자, 커서, 고른 글, 검정과 흰색은 어느 단계에서나 기본값이다
  it.each(TONED)('%s sets the six colors and their bright ones, nothing else', level => {
    const t = terminalTheme(level)

    expect(Object.keys(t).sort()).toEqual([...TWELVE].sort())
    for (const name of TWELVE) expect(t[name], name).toMatch(/^#[0-9a-f]{6}$/)
  })

  it.each(TERMINAL_COLORS)('%s keeps the six ANSI colors apart', level => {
    const t = shown(level)

    for (const names of [ANSI, ANSI.map(bright)]) {
      for (const [i, a] of names.entries()) {
        for (const b of names.slice(i + 1)) {
          const d = Math.abs(hue(t[a]) - hue(t[b]))
          expect(Math.min(d, 360 - d), `${level}: ${a} ${t[a]} vs ${b} ${t[b]}`).toBeGreaterThanOrEqual(15)
        }
      }
    }
  })

  it.each(TONED)('%s keeps each hue and is never stronger than the color of xterm', level => {
    const t = terminalTheme(level)

    for (const name of TWELVE) {
      const own = toOklch(XTERM_COLORS[name])
      const turn = Math.abs(hueDegrees(t[name]) - hueDegrees(XTERM_COLORS[name]))
      expect(Math.min(turn, 360 - turn), `${name} ${t[name]} hue`).toBeLessThan(2)
      expect(toOklch(t[name]).l, `${name} ${t[name]} lightness`).toBeLessThanOrEqual(own.l + ROUNDING)
      expect(toOklch(t[name]).c, `${name} ${t[name]} chroma`).toBeLessThanOrEqual(own.c + ROUNDING)
    }
  })

  // 단계는 차례로 낮아진다: vivid >= soft >= muted. 셋 다 쓰이는 단계다: 가장 선명한 빨강과 초록, 밝은 초록이 단계마다
  // 눈에 띄게 낮아진다.
  it('gets calmer level by level', () => {
    const [vivid, soft, muted] = TERMINAL_COLORS.map(shown)

    for (const name of TWELVE) {
      const [a, b, c] = [vivid, soft, muted].map(t => toOklch(t[name]))
      expect(b.l, `${name} soft lightness`).toBeLessThanOrEqual(a.l + ROUNDING)
      expect(b.c, `${name} soft chroma`).toBeLessThanOrEqual(a.c + ROUNDING)
      expect(c.l, `${name} muted lightness`).toBeLessThanOrEqual(b.l + ROUNDING)
      expect(c.c, `${name} muted chroma`).toBeLessThanOrEqual(b.c + ROUNDING)
    }

    for (const name of ['red', 'green', 'brightGreen']) {
      const [a, b, c] = [vivid, soft, muted].map(t => toOklch(t[name]))
      expect(a.c - b.c, `${name} soft`).toBeGreaterThan(0.01)
      expect(b.c - c.c, `${name} muted`).toBeGreaterThan(0.03)
    }
  })

  // 굵은 글자의 색은 같은 단계의 보통 색보다 어둡지 않다
  it.each(TERMINAL_COLORS)('%s keeps the bright colors at least as light as the normal ones', level => {
    const t = shown(level)

    for (const name of ANSI) expect(toOklch(t[bright(name)]).l, name).toBeGreaterThanOrEqual(toOklch(t[name]).l - ROUNDING)
  })

  // 어둡고 흐린 노랑은 올리브색이다: 단계가 노랑을 이보다 낮추지는 않는다 (xterm의 노랑은 이미 그 밑의 밝기이다).
  it.each(TONED)('%s keeps the yellow a yellow', level => {
    const t = terminalTheme(level)

    for (const name of ['yellow', 'brightYellow']) {
      const [own, toned] = [XTERM_COLORS[name], t[name]].map(toOklch)
      expect(toned.l, name).toBeGreaterThanOrEqual(Math.min(own.l, 0.76) - ROUNDING)
      expect(toned.c, name).toBeGreaterThanOrEqual(Math.min(own.c, 0.13) - ROUNDING)
    }
  })

  // 낮춘 색도 기본값만큼은 읽힌다. xterm의 기본 빨강, 파랑, 보라는 검정 바탕에서 4.5에 못 미친다: owner가 고른 기본값이라
  // 그대로이고, 단계가 그것을 더 낮추지 않을 뿐이다. 굵은 글자의 색은 어느 단계에서나 4.5를 넘는다.
  it.each(TERMINAL_COLORS)('%s is as easy to read on the black background as the colors of xterm', level => {
    const t = shown(level)

    for (const name of ANSI) {
      expect(contrast(t[name], XTERM_COLORS.background), name).toBeGreaterThanOrEqual(0.95 * contrast(XTERM_COLORS[name], XTERM_COLORS.background))
      expect(contrast(t[bright(name)], XTERM_COLORS.background), bright(name)).toBeGreaterThanOrEqual(4.5)
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
