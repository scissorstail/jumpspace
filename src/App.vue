<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script>
export default {
  created() {
    window.preload.setWindowTitle('')
  }
}
</script>

<style lang="scss">
@import '../node_modules/bootstrap/dist/css/bootstrap.css';
@import '../node_modules/bootstrap-vue/dist/bootstrap-vue.css';

html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  overflow: hidden;
}

#app {
  height: 100vh;
}

@font-face {
  font-family: 'Spoqa Han Sans Neo';
  font-weight: 700;
  src: local('Spoqa Han Sans Bold'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Bold.woff2')
      format('woff2'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Bold.woff')
      format('woff'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Bold.ttf')
      format('truetype');
}

@font-face {
  font-family: 'Spoqa Han Sans Neo';
  font-weight: 500;
  src: local('Spoqa Han Sans Medium'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Medium.woff2')
      format('woff2'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Medium.woff')
      format('woff'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Medium.ttf')
      format('truetype');
}

@font-face {
  font-family: 'Spoqa Han Sans Neo';
  font-weight: 400;
  src: local('Spoqa Han Sans Regular'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Regular.woff2')
      format('woff2'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Regular.woff')
      format('woff'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Regular.ttf')
      format('truetype');
}

@font-face {
  font-family: 'Spoqa Han Sans Neo';
  font-weight: 300;
  src: local('Spoqa Han Sans Light'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Light.woff2')
      format('woff2'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Light.woff')
      format('woff'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Light.ttf')
      format('truetype');
}

@font-face {
  font-family: 'Spoqa Han Sans Neo';
  font-weight: 100;
  src: local('Spoqa Han Sans Thin'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Thin.woff2')
      format('woff2'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Thin.woff')
      format('woff'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Thin.ttf')
      format('truetype');
}

* {
  font-family: 'Spoqa Han Sans Neo', 'sans-serif';
}
</style>
