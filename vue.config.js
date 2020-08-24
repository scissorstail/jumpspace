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
