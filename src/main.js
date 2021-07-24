import 'regenerator-runtime/runtime'
import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import mixin from './mixin'
import VTooltip from 'v-tooltip'
import { BootstrapVue } from 'bootstrap-vue'
import './assets/icons'

Vue.config.productionTip = false

Vue.use(VTooltip, {
  popover: {
    // bootstrap-vue와 v-tooltip 클래스 충돌 방지
    defaultBaseClass: 'vt-tooltip vt-popover',
    defaultInnerClass: 'vt-tooltip-inner vt-popover-inner',
    defaultArrowClass: 'vt-tooltip-arrow vt-popover-arrow'
  }
})

Vue.use(BootstrapVue)
;(async () => {
  await Promise.all([
    store.dispatch('diagramLoad'),
    store.dispatch('settingLoad')
  ])

  new Vue({
    router,
    store,
    mixins: [mixin],
    render: h => h(App)
  }).$mount('#app')

  router.replace('/')
})()
