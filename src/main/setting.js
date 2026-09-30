export const DEFAULT_SETTING = {
  gitBashPath: '%ProgramFiles%\\Git\\git-bash.exe',
  isHideToTrayOnClose: false
}

// 저장하거나 읽은 설정을 정리한다. Git Bash 경로를 비워 두면 기본값을 쓴다. (화면은 빈 값을 기본값으로 보여준다)
export function normalizeSetting(data) {
  const gitBashPath = typeof data?.gitBashPath === 'string' ? data.gitBashPath.trim() : ''

  return {
    gitBashPath: gitBashPath || DEFAULT_SETTING.gitBashPath,
    isHideToTrayOnClose: Boolean(data?.isHideToTrayOnClose)
  }
}
