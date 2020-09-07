process.env.VUE_APP_VERSION = require('./package.json').version

module.exports = {
  lintOnSave: false,
  transpileDependencies: [
    /\bvue-awesome\b/
  ],
  pluginOptions: {
    electronBuilder: {
      preload: { preload: 'src/preload.js' }
    }
  }
}
