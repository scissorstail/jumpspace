import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TERMINAL_COLORS, THEMES } from '../../../shared/setting.js'
import { toOklch } from './color'
import { closeTerminalsQuestion, endedLine, errorLine, isLightBackground, nextFontSize, searchSeed, SEARCH_SEED_MAX, MAXIMIZE_SNAP, MIN_CANVAS_HEIGHT, MIN_PANEL_HEIGHT, panelDrag, panelHeight, RECONNECTING_LINE, revealScrollLeft, sessionRouteText, sessionStatusText, terminalCountText, terminalTheme } from './terminal-view'

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

describe('terminalTheme', () => {
  it('maps the theme variables to xterm colors', () => {
    const vars = { '--js-bg': '#000', '--js-text': '#fff', '--js-primary': '#f0f', '--js-line': '#333', '--js-danger': '#f00', '--js-live': '#0f0', '--js-connecting': '#ff0', '--js-sun': '#a0f', '--js-secondary': '#0ff', '--js-ansi-blue': '#00f', '--js-ansi-magenta': '#f0e', '--js-ansi-cyan': '#0fe', '--js-text-muted': '#999' }
    const theme = terminalTheme(name => vars[name])
    // 커서는 글자색, 그 아래 글자는 바탕색 (터미널의 기본). 색 묶음의 주색(#f0f)을 쓰지 않는다.
    expect(theme).toMatchObject({ background: '#000', foreground: '#fff', cursor: '#fff', cursorAccent: '#000', red: '#f00', green: '#0f0', yellow: '#ff0', blue: '#00f', magenta: '#f0e', cyan: '#0fe', brightBlack: '#999' })
    expect(Object.values(theme).every(Boolean)).toBe(true)
  })

  // 설정의 Vivid는 단계를 고를 수 있기 전의 모습 그대로다: 색 묶음의 색 그대로이고, 굵은 글자가 쓰는 밝은 색과
  // 검정은 정하지 않는다 (xterm의 기본값).
  it('is the theme of before as vivid, without a level and with one it does not know', () => {
    const color = paletteVars('sunset-drive')
    const before = {
      background: '#1a0633',
      foreground: '#fff6ef',
      cursor: '#fff6ef',
      cursorAccent: '#1a0633',
      selectionBackground: color('--js-line'),
      red: '#ff4d6d',
      green: '#3dff8a',
      yellow: '#ffd319',
      blue: '#5aa9ff',
      magenta: '#d86bff',
      cyan: '#4ff0ff',
      white: '#fff6ef',
      brightBlack: '#f0c6dc'
    }

    expect(terminalTheme(color)).toEqual(before)
    expect(terminalTheme(color, 'vivid')).toEqual(before)
    for (const odd of ['', 'Soft', 'toString', 'constructor', '__proto__', null, 7]) {
      expect(terminalTheme(color, odd), String(odd)).toEqual(before)
    }
  })

  // owner가 그림에서 본 색들 (2026-10-11, Sunset Drive). 밝은 색은 굵은 글자가 쓴다.
  it('gives the colors the levels were chosen with', () => {
    const color = paletteVars('sunset-drive')

    expect(terminalTheme(color, 'soft')).toMatchObject({
      red: '#e56c7a',
      green: '#5dcc7f',
      yellow: '#d2ae1c',
      blue: '#5aa9ff',
      magenta: '#c783e1',
      cyan: '#01c8d7',
      brightRed: '#ed6476',
      brightGreen: '#60e38a',
      brightYellow: '#e9c000',
      brightBlue: '#5aa9ff',
      brightMagenta: '#cc7de9',
      brightCyan: '#31dceb'
    })
    expect(terminalTheme(color, 'muted')).toMatchObject({
      red: '#d37a82',
      green: '#61ac75',
      yellow: '#cdaf42',
      blue: '#649cda',
      magenta: '#b383c6',
      cyan: '#21acb7',
      brightRed: '#dc747e',
      brightGreen: '#66c280',
      brightYellow: '#e5c13b',
      brightBlue: '#66a9f4',
      brightMagenta: '#c388d9',
      brightCyan: '#02c1cf'
    })
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

const ANSI = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']
const bright = name => `bright${name[0].toUpperCase()}${name.slice(1)}`
// 낮춘 단계들 (vivid가 아닌 것)
const TONED = TERMINAL_COLORS.filter(level => level !== 'vivid')
const everyLevel = THEMES.flatMap(theme => TERMINAL_COLORS.map(level => [theme, level]))
const everyToned = THEMES.flatMap(theme => TONED.map(level => [theme, level]))
// 바탕이 밝은 색 묶음(Plain)과 어두운 것(밤의 셋). 단계가 낮추는 방법이 다르다.
const LIGHT = THEMES.filter(theme => isLightBackground(paletteVars(theme)('--js-bg')))
const DARK = THEMES.filter(theme => !LIGHT.includes(theme))

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

describe('terminal colors of every palette', () => {
  it.each(everyLevel)('%s %s keeps the six ANSI colors apart', (theme, level) => {
    const t = terminalTheme(paletteVars(theme), level)
    // 밝은 색은 낮춘 단계와 밝은 바탕에만 있다
    const groups = level === 'vivid' && DARK.includes(theme) ? [ANSI] : [ANSI, ANSI.map(bright)]

    for (const names of groups) {
      for (const name of names) expect(t[name], `${theme} ${name}`).toMatch(/^#[0-9a-f]{6}$/i)
      for (const [i, a] of names.entries()) {
        for (const b of names.slice(i + 1)) {
          const d = Math.abs(hue(t[a]) - hue(t[b]))
          expect(Math.min(d, 360 - d), `${theme}: ${a} ${t[a]} vs ${b} ${t[b]}`).toBeGreaterThanOrEqual(15)
        }
      }
    }
  })

  // 색 글자는 바탕 위에서 읽혀야 하고, 색 바탕 위의 검정 글자도 (tmux의 상태 줄) 그래야 한다.
  // 낮춘 단계의 검정은 바탕색이라서 두 대비는 같은 값이다.
  it.each(everyLevel)('%s %s can be read on the background', (theme, level) => {
    const t = terminalTheme(paletteVars(theme), level)
    const names = level === 'vivid' && DARK.includes(theme) ? ANSI : [...ANSI, ...ANSI.map(bright)]

    for (const name of names) expect(contrast(t[name], t.background), `${name} ${t[name]}`).toBeGreaterThanOrEqual(4.5)
    if (level !== 'vivid' || LIGHT.includes(theme)) expect(t.black).toBe(t.background)
  })

  // xterm의 기본 밝은 색과 검정은 어두운 바탕의 것이다: 흰 바탕에서는 Vivid도 열여섯 색을 다 정한다 (색 묶음의 색 그대로)
  it.each(LIGHT)('%s vivid sets all sixteen colors to the palette colors', theme => {
    const color = paletteVars(theme)
    const t = terminalTheme(color, 'vivid')
    const own = { red: '--js-danger', green: '--js-live', yellow: '--js-connecting', blue: '--js-ansi-blue', magenta: '--js-ansi-magenta', cyan: '--js-ansi-cyan' }

    for (const name of ANSI) {
      expect(t[name], name).toBe(color(own[name]))
      expect(t[bright(name)], bright(name)).toBe(color(own[name]))
    }
    expect(t.black).toBe(t.background)
    expect(t.brightWhite).toBe(t.foreground)
    expect(terminalTheme(color, 'toString')).toEqual(t)
  })

  it.each(everyToned)('%s %s fills all sixteen colors and leaves the rest of the theme alone', (theme, level) => {
    const vivid = terminalTheme(paletteVars(theme))
    const t = terminalTheme(paletteVars(theme), level)

    expect(Object.keys(t).sort()).toEqual([...new Set([...Object.keys(vivid), 'black', 'brightWhite', ...ANSI.map(bright)])].sort())
    for (const name of ['background', 'foreground', 'cursor', 'cursorAccent', 'selectionBackground', 'white', 'brightBlack']) {
      expect(t[name], name).toBe(vivid[name])
    }
    expect(t.brightWhite).toBe(vivid.foreground)
  })

  it.each(everyToned)('%s %s keeps each hue and is never stronger than the palette color', (theme, level) => {
    const vivid = terminalTheme(paletteVars(theme))
    const t = terminalTheme(paletteVars(theme), level)

    for (const name of ANSI) {
      const [palette, normal, bolder] = [vivid[name], t[name], t[bright(name)]].map(toOklch)

      for (const hex of [t[name], t[bright(name)]]) {
        const turn = Math.abs(hueDegrees(hex) - hueDegrees(vivid[name]))
        expect(Math.min(turn, 360 - turn), `${name} ${hex} hue`).toBeLessThan(2)
        expect(toOklch(hex).l, `${name} ${hex} lightness`).toBeLessThanOrEqual(palette.l + ROUNDING)
        expect(toOklch(hex).c, `${name} ${hex} chroma`).toBeLessThanOrEqual(palette.c + ROUNDING)
      }
      // 굵은 글자의 색은 보통 색보다 어둡거나 흐리지 않다
      expect(bolder.l, `${name} bright lightness`).toBeGreaterThanOrEqual(normal.l - ROUNDING)
      expect(bolder.c, `${name} bright chroma`).toBeGreaterThanOrEqual(normal.c - ROUNDING)
    }
  })

  // 단계는 차례로 낮아진다: vivid >= soft >= muted. 초록(가장 밝고 선명한 색)은 단계마다 눈에 띄게 낮아진다.
  // 밝은 바탕(Plain)에서는 선명함만 낮아진다: 그 색은 흰 바탕에서 읽히도록 이미 어둡고, 밝기를 바꾸면 덜 읽히거나 검정에 가까워진다.
  it.each(DARK)('%s gets calmer level by level', theme => {
    const [vivid, soft, muted] = TERMINAL_COLORS.map(level => terminalTheme(paletteVars(theme), level))

    for (const name of ANSI) {
      const [a, b, c] = [vivid, soft, muted].map(t => toOklch(t[name]))
      expect(b.l, `${name} soft lightness`).toBeLessThanOrEqual(a.l + ROUNDING)
      expect(b.c, `${name} soft chroma`).toBeLessThanOrEqual(a.c + ROUNDING)
      expect(c.l, `${name} muted lightness`).toBeLessThanOrEqual(b.l + ROUNDING)
      expect(c.c, `${name} muted chroma`).toBeLessThanOrEqual(b.c + ROUNDING)
    }

    const [a, b, c] = [vivid, soft, muted].map(t => toOklch(t.green))
    expect(a.l - b.l).toBeGreaterThan(0.08)
    expect(a.c - b.c).toBeGreaterThan(0.05)
    expect(b.l - c.l).toBeGreaterThan(0.05)
    expect(b.c - c.c).toBeGreaterThan(0.03)
  })

  it.each(LIGHT)('%s gets calmer level by level in its colorfulness and keeps their lightness', theme => {
    const [vivid, soft, muted] = TERMINAL_COLORS.map(level => terminalTheme(paletteVars(theme), level))

    for (const name of ANSI) {
      const [a, b, c] = [vivid, soft, muted].map(t => toOklch(t[name]))
      for (const [x, level] of [[b, 'soft'], [c, 'muted']]) expect(Math.abs(x.l - a.l), `${name} ${level} lightness`).toBeLessThan(ROUNDING)
      expect(b.c, `${name} soft chroma`).toBeLessThanOrEqual(a.c + ROUNDING)
      expect(c.c, `${name} muted chroma`).toBeLessThanOrEqual(b.c + ROUNDING)
    }

    // 셋 다 쓰이는 단계다: 가장 선명한 빨강과 파랑이 단계마다 눈에 띄게 낮아진다
    for (const name of ['red', 'blue']) {
      const [a, b, c] = [vivid, soft, muted].map(t => toOklch(t[name]))
      expect(a.c - b.c, name).toBeGreaterThan(0.05)
      expect(b.c - c.c, name).toBeGreaterThan(0.02)
    }
  })

  // 어둡고 흐린 노랑은 올리브색이다: 노랑은 어느 단계에서나 이만큼은 밝고 선명하다.
  it.each(everyToned.filter(([theme]) => DARK.includes(theme)))('%s %s keeps the yellow a yellow', (theme, level) => {
    const t = terminalTheme(paletteVars(theme), level)

    for (const name of ['yellow', 'brightYellow']) {
      const color = toOklch(t[name])
      expect(color.l, name).toBeGreaterThanOrEqual(0.76 - ROUNDING)
      expect(color.c, name).toBeGreaterThanOrEqual(0.13 - ROUNDING)
    }
  })

  // 흰 바탕의 노랑은 읽히려면 어두울 수밖에 없다 (어두운 금색). 선명함까지 낮추면 갈색이 되므로 선명함은 지킨다.
  it.each(everyToned.filter(([theme]) => LIGHT.includes(theme)))('%s %s keeps the dark yellow of a light background colorful', (theme, level) => {
    const t = terminalTheme(paletteVars(theme), level)

    for (const name of ['yellow', 'brightYellow']) expect(toOklch(t[name]).c, name).toBeGreaterThanOrEqual(0.1 - ROUNDING)
  })

  it('takes Plain for the one light background and the night palettes for dark ones', () => {
    expect(LIGHT).toEqual(['plain'])
    expect(isLightBackground('#ffffff')).toBe(true)
    expect(isLightBackground('#000000')).toBe(false)
    expect(isLightBackground('not a color')).toBe(false)
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
