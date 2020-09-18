process.env.VUE_APP_VERSION = require('./package.json').version

module.exports = {
  transpileDependencies: [/\bvue-awesome\b/],
  pluginOptions: {
    electronBuilder: {
      preload: { preload: 'src/preload.js' }
    }
  }
}
