import Vue from 'vue'
import Vuex from 'vuex'

import diagram from './modules/diagram'
import setting from './modules/setting'
import terminal from './modules/terminal'

Vue.use(Vuex)

export default new Vuex.Store({
  state: {},
  mutations: {},
  actions: {},
  modules: {
    diagram,
    setting,
    terminal
  }
})
