<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script>
export default {
  computed: {
    theme() {
      return this.$store.getters.setting.theme
    }
  },
  watch: {
    theme: {
      immediate: true,
      handler(theme) {
        document.documentElement.dataset.theme = theme
      }
    }
  },
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

// 기본 글꼴은 body에 두고 상속시킨다. (모든 요소에 직접 주면 제목용 글꼴을 지정한 단추 안의 글자까지 덮어쓴다)
// 터미널(xterm.js)은 자기 고정폭 글꼴을 직접 지정한다. Bootstrap은 .tooltip, .popover에 글꼴을 따로 준다.
body,
.tooltip,
.popover {
  font-family: 'Spoqa Han Sans Neo', sans-serif;
}
</style>
