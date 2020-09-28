const info = require('./package.json')
process.env.VUE_APP_VERSION = info.version

module.exports = {
  transpileDependencies: [/\bvue-awesome\b/],
  pluginOptions: {
    electronBuilder: {
      preload: { preload: 'src/preload.js' },
      appId: `com.electron.${info.name}`,
      productName: `${info.name} v${info.version}`
    }
  }
}
