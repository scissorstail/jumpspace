// 터미널 패널이 화면에 쓰는 글과 색 (순수 함수). xterm에 쓰는 줄은 ANSI 색을 붙인다.

const GRAY = '\x1b[90m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

// 탭에 마우스를 올렸을 때 보이는 상태. 실행 중이어도 로그인 표시가 오기 전에는 "연결 중"이다. (캔버스와 같다)
export function sessionStatusText(session) {
  return {
    starting: 'Starting',
    running: session?.connected ? 'Connected' : 'Connecting (not logged in yet)',
    exited: session?.exitCode ? `Ended (exit status ${session.exitCode})` : 'Ended',
    failed: 'Could not start'
  }[session?.status]
}

// 목록의 item 옆 숫자에 붙는 설명 (마우스를 올렸을 때, 화면 읽기)
export function terminalCountText(count) {
  return count === 1 ? '1 terminal open' : `${count} terminals open`
}

// 세션이 끝났을 때 터미널에 쓰는 줄. Enter로 다시 접속할 수 있다는 것도 알린다.
export function endedLine(exitCode) {
  return `\r\n${GRAY}[session ended${exitCode ? `, exit status ${exitCode}` : ''}] Press Enter to reconnect.${RESET}\r\n`
}

export const RECONNECTING_LINE = `\r\n${GRAY}[reconnecting]${RESET}\r\n`

// main이 돌려준 오류 문구. 여러 줄이면 터미널 줄바꿈(\r\n)으로 바꾼다.
export function errorLine(error) {
  return `${RED}${String(error).replace(/\r?\n/g, '\r\n')}${RESET}\r\n`
}

// 터미널 색: 지금 고른 테마의 CSS 변수에서 읽는다. color(name)은 그 변수의 값을 돌려준다.
// 초록과 노랑은 모든 색 묶음에서 같은 --js-live / --js-connecting이다. (--js-sun은 Vapor Blue에서 보라라서 magenta와 구별되지 않았다)
// magenta와 cyan은 --js-ansi-*: 보통 주색과 보조색이고, Sunset Drive에서는 빨강·노랑과 겹치지 않게 따로 정한다.
// 커서는 터미널이 보통 그러듯 글자색이고, 그 아래의 글자는 바탕색이다 (owner, 2026-10-11: 색 묶음의 주색으로 칠한
// 커서는 화면을 다시 그리는 프로그램에서 번쩍이는 색 덩어리로 보였다).
export function terminalTheme(color) {
  return {
    background: color('--js-bg'),
    foreground: color('--js-text'),
    cursor: color('--js-text'),
    cursorAccent: color('--js-bg'),
    selectionBackground: color('--js-line'),
    red: color('--js-danger'),
    green: color('--js-live'),
    yellow: color('--js-connecting'),
    blue: '#5aa9ff',
    magenta: color('--js-ansi-magenta'),
    cyan: color('--js-ansi-cyan'),
    white: color('--js-text'),
    brightBlack: color('--js-text-muted')
  }
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
