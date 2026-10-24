// 앱 설정의 기본값과 검증. main(저장/읽기)과 renderer(store의 초기값)가 함께 쓴다. Node 모듈을 쓰지 않는다.

// openIn: ssh를 어디서 여는지. 'app' = 앱 안의 터미널, 'window' = Git Bash 창
export const OPEN_IN = ['app', 'window']

// 화면의 색 묶음 (renderer의 assets/theme.scss에 있는 data-theme 값)
export const THEMES = ['neon-night', 'sunset-drive', 'vapor-blue', 'plain']

// 배경 풍경의 효과 (renderer의 components/layout/scene-backdrop.vue에 있는 .scene-* 클래스)
export const BACKDROPS = ['vivid', 'soft', 'depth', 'crt', 'off']

// 앱 안의 터미널이 프로그램의 색(ANSI 여섯 색)을 얼마나 낮춰서 보여주는지 (renderer의 utils/terminal-view.js).
// 'vivid' = 색 묶음의 네온 색 그대로, 'soft' = 조금 낮춤, 'muted' = 많이 낮춤
export const TERMINAL_COLORS = ['vivid', 'soft', 'muted']

// 노드 아래 글 뒤 유리판의 흐림(px). 0이면 유리판이 없다. (renderer의 views/Layout.vue가 #editor-area에 두고
// components/editor/canvas.scss가 쓴다)
export const NODE_BLUR_MAX = 20

// 앱 안의 터미널의 글꼴 크기(px). 터미널에서 Ctrl +/-로 바꾸고 Ctrl 0으로 기본값으로 돌린다 (renderer의 utils/terminal-view.js).
export const TERMINAL_FONT_SIZE_MIN = 8
export const TERMINAL_FONT_SIZE_MAX = 32

export const DEFAULT_SETTING = {
  gitBashPath: '%ProgramFiles%\\Git\\git-bash.exe',
  isHideToTrayOnClose: false,
  openIn: 'app',
  theme: 'neon-night',
  backdrop: 'depth',
  // 네온 색 그대로(vivid)는 넓게 칠해지면 눈이 부셔서, 조금 낮춘 것이 기본이다 (owner, 2026-10-11)
  terminalColors: 'soft',
  nodeBlur: 0,
  terminalFontSize: 13,
  // 캔버스에서 노드의 접속 정보(user, host, port, 포워딩)를 숨기고 이름만 보인다 (머리글의 눈 단추)
  hideNodeInfo: false,
  // 다이어그램 목록 위에 마지막에 연 것 몇 개를 따로 보인다 (owner, 2026-10-17: 설정에서 켜고 끈다)
  showRecentSpaces: true
}

// min..max의 정수. 숫자가 아니면 fallback (숫자를 적은 글자는 숫자로 읽는다: 슬라이더가 글자를 준다)
function wholeNumber(value, min, max, fallback) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isFinite(number)) return fallback

  return Math.min(max, Math.max(min, Math.round(number)))
}

// 저장하거나 읽은 설정을 정리한다. Git Bash 경로를 비워 두면 기본값을 쓴다. (화면은 빈 값을 기본값으로 보여준다)
export function normalizeSetting(data) {
  const gitBashPath = typeof data?.gitBashPath === 'string' ? data.gitBashPath.trim() : ''

  return {
    gitBashPath: gitBashPath || DEFAULT_SETTING.gitBashPath,
    isHideToTrayOnClose: Boolean(data?.isHideToTrayOnClose),
    openIn: OPEN_IN.includes(data?.openIn) ? data.openIn : DEFAULT_SETTING.openIn,
    theme: THEMES.includes(data?.theme) ? data.theme : DEFAULT_SETTING.theme,
    backdrop: BACKDROPS.includes(data?.backdrop) ? data.backdrop : DEFAULT_SETTING.backdrop,
    terminalColors: TERMINAL_COLORS.includes(data?.terminalColors) ? data.terminalColors : DEFAULT_SETTING.terminalColors,
    nodeBlur: wholeNumber(data?.nodeBlur, 0, NODE_BLUR_MAX, DEFAULT_SETTING.nodeBlur),
    terminalFontSize: wholeNumber(data?.terminalFontSize, TERMINAL_FONT_SIZE_MIN, TERMINAL_FONT_SIZE_MAX, DEFAULT_SETTING.terminalFontSize),
    hideNodeInfo: data?.hideNodeInfo === true,
    // 켜진 것이 기본이라서, 이 키가 없는 설정 파일(전의 판)에서도 켜져 있다. 꺼 둔 것(false)만 끈다.
    showRecentSpaces: data?.showRecentSpaces !== false
  }
}
