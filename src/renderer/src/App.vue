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
      format('woff2');
}

@font-face {
  font-family: 'Spoqa Han Sans Neo';
  font-weight: 500;
  src: local('Spoqa Han Sans Medium'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Medium.woff2')
      format('woff2');
}

@font-face {
  font-family: 'Spoqa Han Sans Neo';
  font-weight: 400;
  src: local('Spoqa Han Sans Regular'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Regular.woff2')
      format('woff2');
}

@font-face {
  font-family: 'Spoqa Han Sans Neo';
  font-weight: 300;
  src: local('Spoqa Han Sans Light'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Light.woff2')
      format('woff2');
}

@font-face {
  font-family: 'Spoqa Han Sans Neo';
  font-weight: 100;
  src: local('Spoqa Han Sans Thin'),
    url('./assets/fonts/SpoqaHanSansNeo/SpoqaHanSansNeo-Thin.woff2')
      format('woff2');
}

* {
  font-family: 'Spoqa Han Sans Neo', 'sans-serif';
}

// 확인창과 토스트: 팝업 카드와 같은 모양
.modal-content {
  border: 0;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
}

.modal-header {
  border-bottom: 0;
  padding-bottom: 0;
}

.modal-title {
  font-size: 1.1rem;
  font-weight: 600;
}

.modal-footer {
  border-top: 0;
  padding-top: 0;
}

.b-toast .toast {
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}
</style>
