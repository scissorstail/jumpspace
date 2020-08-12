import 'regenerator-runtime/runtime'
import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'

import 'vue-awesome/icons'
import Icon from 'vue-awesome/components/Icon'
import VTooltip from 'v-tooltip'

import { BootstrapVue } from 'bootstrap-vue'

Vue.config.productionTip = false

Vue.component('v-icon', Icon)
Vue.use(BootstrapVue)
Vue.use(VTooltip)

;(async () => {
  await store.dispatch('diagramLoad')

  new Vue({
    router,
    store,
    render: h => h(App)
  }).$mount('#app')
})()
