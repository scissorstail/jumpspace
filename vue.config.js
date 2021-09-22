const info = require('./package.json')
process.env.VUE_APP_VERSION = info.version

module.exports = {
  pluginOptions: {
    electronBuilder: {
      nodeIntegration: false,
      preload: { preload: 'src/preload.js' },
      appId: `com.electron.${info.name}`,
      productName: `${info.name} v${info.version}`
    }
  }
}
