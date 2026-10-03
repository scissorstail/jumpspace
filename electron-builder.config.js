const info = require('./package.json')

module.exports = {
  appId: `com.electron.${info.name}`,
  productName: `${info.name} v${info.version}`,
  directories: {
    buildResources: 'build',
    output: 'dist_electron'
  },
  files: ['out/**/*', 'resources/icon.png', 'package.json'],
  // node-pty(앱 안의 터미널)는 N-API 모듈이고 Windows/macOS용 빌드를 함께 배포한다. Electron용으로 다시 빌드할 필요가 없고,
  // 다시 빌드하면 Windows에서 Visual Studio가 필요해진다. 실행 파일(conpty.dll, OpenConsole.exe, spawn-helper)은 asar 밖에 둔다.
  npmRebuild: false,
  asarUnpack: ['node_modules/node-pty/**'],
  win: {
    icon: 'build/icons/icon.ico',
    // Linux에서 컴파일된 build/Release/pty.node와 macOS용 빌드는 Windows 설치 파일에 넣지 않는다.
    files: ['!node_modules/node-pty/build/**', '!node_modules/node-pty/prebuilds/darwin-*/**']
  }
}
