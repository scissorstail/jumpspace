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
export function terminalTheme(color) {
  return {
    background: color('--js-bg'),
    foreground: color('--js-text'),
    cursor: color('--js-primary'),
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

// 옆으로 넘기는 탭 목록에서 탭 하나가 다 보이게 하는 scrollLeft. 이미 보이면 그대로 둔다.
// view: { scrollLeft, width } (목록), item: { left, width } (목록 내용 안에서의 탭 위치)
export function revealScrollLeft(view, item) {
  if (item.left < view.scrollLeft || item.width >= view.width) return item.left
  if (item.left + item.width > view.scrollLeft + view.width) return item.left + item.width - view.width
  return view.scrollLeft
}
