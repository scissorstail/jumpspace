// openIn: ssh를 어디서 여는지. 'app' = 앱 안의 터미널, 'window' = Git Bash 창
export const OPEN_IN = ['app', 'window']

export const DEFAULT_SETTING = {
  gitBashPath: '%ProgramFiles%\\Git\\git-bash.exe',
  isHideToTrayOnClose: false,
  openIn: 'app'
}

// 저장하거나 읽은 설정을 정리한다. Git Bash 경로를 비워 두면 기본값을 쓴다. (화면은 빈 값을 기본값으로 보여준다)
export function normalizeSetting(data) {
  const gitBashPath = typeof data?.gitBashPath === 'string' ? data.gitBashPath.trim() : ''

  return {
    gitBashPath: gitBashPath || DEFAULT_SETTING.gitBashPath,
    isHideToTrayOnClose: Boolean(data?.isHideToTrayOnClose),
    openIn: OPEN_IN.includes(data?.openIn) ? data.openIn : DEFAULT_SETTING.openIn
  }
}
