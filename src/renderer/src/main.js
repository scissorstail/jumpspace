// Rete 플러그인(rete-vue-render-plugin 등)이 Babel regenerator 결과물을 그대로 배포하고 있어서 필요하다.
import 'regenerator-runtime/runtime'
import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import VTooltip from 'v-tooltip'
import vClickOutside from 'v-click-outside'
import { BootstrapVue } from 'bootstrap-vue'
import 'bootstrap/dist/css/bootstrap.css'
import 'bootstrap-vue/dist/bootstrap-vue.css'
import './assets/icons'

Vue.config.productionTip = false

Vue.use(VTooltip, {
  popover: {
    // bootstrap-vue와 v-tooltip 클래스 충돌 방지
    defaultBaseClass: 'vt-tooltip vt-popover',
    defaultInnerClass: 'vt-tooltip-inner vt-popover-inner',
    defaultArrowClass: 'vt-tooltip-arrow vt-popover-arrow',
    // 화살표 요소에는 스타일이 없어서 popper가 화살표 크기를 팝오버 너비로 계산하고, 그만큼 팝오버를 밀어내 창 밖으로 나가게 한다.
    // 화살표는 그리지 않으므로 끄고, 팝오버는 창 안에 머물게 한다.
    defaultPopperOptions: { modifiers: { arrow: { enabled: false } } },
    defaultBoundariesElement: 'viewport'
  }
})
Vue.use(vClickOutside)

Vue.use(BootstrapVue)
;(async () => {
  await Promise.all([
    store.dispatch('diagramLoad'),
    store.dispatch('settingLoad')
  ])

  new Vue({
    router,
    store,
    render: h => h(App)
  }).$mount('#app')

  router.replace('/')
})()
