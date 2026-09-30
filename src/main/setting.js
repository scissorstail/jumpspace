// openIn: ssh를 어디서 여는지. 'app' = 앱 안의 터미널, 'window' = Git Bash 창
export const OPEN_IN = ['app', 'window']

// 화면의 색 묶음 (renderer의 assets/theme.scss에 있는 data-theme 값)
export const THEMES = ['neon-night', 'sunset-drive', 'vapor-blue']

export const DEFAULT_SETTING = {
  gitBashPath: '%ProgramFiles%\\Git\\git-bash.exe',
  isHideToTrayOnClose: false,
  openIn: 'app',
  theme: 'neon-night'
}

// 저장하거나 읽은 설정을 정리한다. Git Bash 경로를 비워 두면 기본값을 쓴다. (화면은 빈 값을 기본값으로 보여준다)
export function normalizeSetting(data) {
  const gitBashPath = typeof data?.gitBashPath === 'string' ? data.gitBashPath.trim() : ''

  return {
    gitBashPath: gitBashPath || DEFAULT_SETTING.gitBashPath,
    isHideToTrayOnClose: Boolean(data?.isHideToTrayOnClose),
    openIn: OPEN_IN.includes(data?.openIn) ? data.openIn : DEFAULT_SETTING.openIn,
    theme: THEMES.includes(data?.theme) ? data.theme : DEFAULT_SETTING.theme
  }
}
