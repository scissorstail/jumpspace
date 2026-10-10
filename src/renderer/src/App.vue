<template>
  <div id="app">
    <Layout />
  </div>
</template>

<script>
import Layout from './views/Layout.vue'

// 화면은 Layout 하나뿐이라 라우터 없이 바로 그린다.
export default {
  components: { Layout },
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

// 일반 글자(본문, 입력란, 메뉴, 설명)는 Pretendard로 쓴다. 굵기를 모두 담은 가변 글꼴 파일 하나다. (OFL, fonts/Pretendard/LICENSE.txt)
// 제목용 픽셀 글꼴(--js-font-display)과 고정폭 글꼴(--js-font-mono)은 그대로다. 글꼴을 body에 거는 곳은 theme.scss다.
@font-face {
  font-family: 'Pretendard Variable';
  font-weight: 45 920;
  font-style: normal;
  font-display: swap;
  src: url('./assets/fonts/Pretendard/PretendardVariable.woff2') format('woff2-variations');
}
</style>
