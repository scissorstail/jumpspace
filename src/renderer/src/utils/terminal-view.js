// 터미널 패널이 화면에 쓰는 글과 색 (순수 함수). xterm에 쓰는 줄은 ANSI 색을 붙인다.
import { tone } from './color.js'
import { DEFAULT_SETTING, TERMINAL_FONT_SIZE_MAX, TERMINAL_FONT_SIZE_MIN } from '../../../shared/setting.js'

const GRAY = '\x1b[90m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'
const CAN = '\x18'

// 글꼴 크기 단축키(utils/terminal-sessions.js의 terminalShortcut)를 누른 뒤의 크기: 1px씩, 설정의 범위 안에서.
export function nextFontSize(size, shortcut) {
  if (shortcut === 'font-reset') return DEFAULT_SETTING.terminalFontSize

  const step = { 'font-up': 1, 'font-down': -1 }[shortcut] || 0
  return Math.min(TERMINAL_FONT_SIZE_MAX, Math.max(TERMINAL_FONT_SIZE_MIN, size + step))
}

// 찾는 칸을 열 때 터미널에서 고른 글을 찾는 글로 쓴다 (에디터들처럼). 한 줄 안에서 고른 것만: 여러 줄이나
// 아주 긴 것은 찾으려던 글이 아니다. 쓸 것이 없으면 ''(전에 찾던 글을 둔다).
export const SEARCH_SEED_MAX = 200
export function searchSeed(selection) {
  const text = String(selection ?? '')

  return /[\r\n]/.test(text) || text.trim() === '' || text.length > SEARCH_SEED_MAX ? '' : text
}

// 탭에 마우스를 올렸을 때 보이는 상태. 실행 중이어도 로그인 표시가 오기 전에는 "연결 중"이다. (캔버스와 같다)
export function sessionStatusText(session) {
  return {
    starting: 'Starting',
    running: session?.connected ? 'Connected' : 'Connecting (not logged in yet)',
    exited: session?.exitCode ? `Ended (exit status ${session.exitCode})` : 'Ended',
    failed: 'Could not start'
  }[session?.status]
}

// 탭의 툴팁에서 상태 뒤에 붙는 말: 세션이 앞의 노드들을 거쳐 왔으면 그 수. 바로 접속했으면 빈 글자.
// (주소는 넣지 않는다: 노드 정보를 가린 동안에도 툴팁은 보인다)
export function sessionRouteText(session) {
  const previous = (session?.hops?.length || 0) - 1
  if (previous < 1) return ''

  return previous === 1 ? ', through 1 previous node' : `, through ${previous} previous nodes`
}

// 목록의 item 옆 숫자에 붙는 설명 (마우스를 올렸을 때, 화면 읽기)
export function terminalCountText(count) {
  return count === 1 ? '1 terminal open' : `${count} terminals open`
}

// 목록에서 한 item의 터미널을 모두 닫기 전에 묻는 말 (owner, 2026-10-17, #254). 여는 중이거나 도는 탭이 없으면 묻지 않는다
// (null): 끝난 탭과 열지 못한 탭은 닫아도 잃을 것이 없다. 트레이의 Quit도 도는 터미널이 있을 때만 묻는다.
export function closeTerminalsQuestion(name, sessions = []) {
  const running = sessions.filter(x => x.status === 'starting' || x.status === 'running').length
  if (running === 0) return null

  const space = `"${name || '(untitled)'}"`
  if (sessions.length === 1) return `Close the terminal of ${space}? It is still running.`
  const still = running === sessions.length ? 'All of them are still running.' : `${running} of them ${running === 1 ? 'is' : 'are'} still running.`
  return `Close all ${sessions.length} terminals of ${space}? ${still}`
}

// 세션이 끝났을 때 터미널에 쓰는 줄. Enter로 다시 접속할 수 있다는 것도 알린다.
// 맨 앞의 CAN은 프로그램이 끝내지 못한 제어 문자열을 버린다 (#271): 접속이 OSC 52의 한가운데서 끊기면, 그 OSC가 이 줄의
// ESC에서 끝난 것으로 읽혀 잘린 글이 클립보드에 들어갈 수 있었다. CAN은 화면에 아무것도 그리지 않는다.
export function endedLine(exitCode) {
  return `${CAN}\r\n${GRAY}[session ended${exitCode ? `, exit status ${exitCode}` : ''}] Press Enter to reconnect.${RESET}\r\n`
}

export const RECONNECTING_LINE = `\r\n${GRAY}[reconnecting]${RESET}\r\n`

// main이 돌려준 오류 문구. 여러 줄이면 터미널 줄바꿈(\r\n)으로 바꾼다.
export function errorLine(error) {
  return `${RED}${String(error).replace(/\r?\n/g, '\r\n')}${RESET}\r\n`
}

// 터미널 색은 xterm.js의 기본값이다, 어느 색 묶음에서나 (owner, 2026-10-24, #289: "터미널은 항상 기본 값을 쓰게 해주세요",
// 그 기본값은 xterm 자체의 것이라고 골랐다): 검정 바탕에 흰 글자와 흰 커서, ANSI 열여섯 색은 xterm의 표(Tango)이다. 전에는
// 색 묶음의 CSS 변수에서 읽었고, 밝은 Plain에서는 터미널도 밝았다 (#288). 패널에서 화면의 둘레(.terminal-body)도 같은 바탕이다.
// XTERM_COLORS는 @xterm/xterm에 들어 있는 값의 사본이다 (xterm은 그 표를 내보내지 않는다): terminal-view.test.js가
// node_modules의 xterm 소스와 비교한다. xterm의 기본 빨강, 파랑, 보라는 검정 바탕에서 대비가 4.5에 못 미치지만(3.2 ~ 3.6)
// owner가 고른 기본값이라 그대로 둔다.
export const XTERM_COLORS = Object.freeze({
  background: '#000000',
  foreground: '#ffffff',
  black: '#2e3436',
  red: '#cc0000',
  green: '#4e9a06',
  yellow: '#c4a000',
  blue: '#3465a4',
  magenta: '#75507b',
  cyan: '#06989a',
  white: '#d3d7cf',
  brightBlack: '#555753',
  brightRed: '#ef2929',
  brightGreen: '#8ae234',
  brightYellow: '#fce94f',
  brightBlue: '#729fcf',
  brightMagenta: '#ad7fa8',
  brightCyan: '#34e2e2',
  brightWhite: '#eeeeec'
})

// 터미널 프로그램이 넓게 칠하는 색은(tmux의 상태 줄은 초록 바탕이다) 눈이 부실 수 있다 (owner, 2026-10-11: "너무 쨍한 것
// 같은데", 그때는 색 묶음의 네온 색이었다). 그래서 여섯 색을 얼마나 낮출지 고른다 (설정 > Terminal colors,
// src/shared/setting.js의 TERMINAL_COLORS). 낮춘 색은 여기서 계산한다 (utils/color.js의 tone): 같은 색상으로 밝기와
// 선명함의 위만 자른다.
//   vivid: xterm의 기본값 그대로라서 아무 색도 정하지 않는다 ({}). xterm은 정하지 않은 색마다 제 기본값을 쓰므로, 다른
//   단계에서 바꾼 색도 그리로 돌아간다.
//   soft, muted: 여섯 색과 그 밝은 색(굵은 글자)을 낮춘다. 밝은 색은 xterm의 밝은 색을 보통 색보다 조금 위에서 자른다.
//   검정과 흰색, 바탕, 글자, 커서, 고른 글의 색은 기본값 그대로다.
// xterm의 표는 네온보다 이미 차분해서, 보통 색 중에 soft가 낮추는 것은 선명한 빨강과 초록 정도이고 나머지는 밝은 색이다.
const TONES = {
  soft: { lightness: 0.76, chroma: 0.15 },
  muted: { lightness: 0.68, chroma: 0.11 }
}
// 밝은 색은 보통 색보다 이만큼 더 밝고 선명해도 된다
const BRIGHTER = { lightness: 0.06, chroma: 0.02 }
// 노랑은 이보다 어둡거나 흐리게 자르면 올리브색이 된다: 어느 단계에서나 여기까지만 낮춘다
const YELLOW_FLOOR = { lightness: 0.76, chroma: 0.13 }

const ANSI = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']
const brightName = name => `bright${name[0].toUpperCase()}${name.slice(1)}`

export function terminalTheme(level = 'vivid') {
  // 모르는 단계는 vivid다 ('toString' 같은 이름도)
  if (!Object.hasOwn(TONES, level)) return {}

  const limit = TONES[level]
  const theme = {}

  for (const name of ANSI) {
    const floor = name === 'yellow' ? YELLOW_FLOOR : { lightness: 0, chroma: 0 }
    const lightness = Math.max(limit.lightness, floor.lightness)
    const chroma = Math.max(limit.chroma, floor.chroma)

    theme[name] = tone(XTERM_COLORS[name], lightness, chroma)
    theme[brightName(name)] = tone(XTERM_COLORS[brightName(name)], lightness + BRIGHTER.lightness, chroma + BRIGHTER.chroma)
  }

  return theme
}

// 터미널 패널의 높이. 캔버스에 MIN_CANVAS_HEIGHT는 남기고, 패널은 MIN_PANEL_HEIGHT보다 낮아지지 않는다.
//   wanted: 사용자가 끌어서 정한 높이, available: 캔버스와 패널이 나눠 쓰는 높이 (#workspace)
// 창이 낮아지면 보이는 높이만 줄고 wanted는 그대로라서, 창을 다시 키우면 원래 높이로 돌아온다.
export const MIN_PANEL_HEIGHT = 140
export const MIN_CANVAS_HEIGHT = 200 // 노드 하나와 그 아래 글이 대략 들어가는 높이

export function panelHeight(wanted, available) {
  const max = Math.max(MIN_PANEL_HEIGHT, available - MIN_CANVAS_HEIGHT)
  return Math.min(max, Math.max(MIN_PANEL_HEIGHT, wanted))
}

// 패널의 위쪽 가장자리를 끌 때의 모습. 패널은 캔버스를 남기는 높이(panelHeight의 최대)에서 멈추는데, 거기서
// MAXIMIZE_SNAP보다 더 끌어 올리면 최대화한다 (캔버스 없이 헤더 아래까지). 마우스의 위치만 보므로, 놓기 전에
// 다시 끌어 내리면 풀리고, 최대화한 패널을 끌어 내려도 같은 자리에서 풀린다.
//   wanted: 마우스를 따라간 높이, available: 캔버스와 패널이 나눠 쓰는 높이
//   돌려주는 값: { maximized, height } (height는 최대화하지 않았을 때의 높이)
export const MAXIMIZE_SNAP = 80

export function panelDrag(wanted, available) {
  const height = panelHeight(wanted, available)
  return { maximized: wanted > panelHeight(Infinity, available) + MAXIMIZE_SNAP, height }
}

// 옆으로 넘기는 탭 목록에서 탭 하나가 다 보이게 하는 scrollLeft. 이미 보이면 그대로 둔다.
// view: { scrollLeft, width } (목록), item: { left, width } (목록 내용 안에서의 탭 위치)
export function revealScrollLeft(view, item) {
  if (item.left < view.scrollLeft || item.width >= view.width) return item.left
  if (item.left + item.width > view.scrollLeft + view.width) return item.left + item.width - view.width
  return view.scrollLeft
}
