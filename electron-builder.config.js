const info = require('./package.json')

module.exports = {
  appId: `com.electron.${info.name}`,
  productName: `${info.name} v${info.version}`,
  directories: {
    buildResources: 'build',
    output: 'dist_electron'
  },
  files: ['out/**/*', 'resources/icon.png', 'package.json'],
  win: {
    icon: 'build/icons/icon.ico'
  }
}
