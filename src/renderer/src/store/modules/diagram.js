export default {
  state: {
    diagram: []
  },
  getters: {
    diagram(state) {
      return state.diagram
    }
  },
  mutations: {
    diagramUpdate(state, payload) {
      state.diagram = payload
    }
  },
  actions: {
    diagramLoad({ commit }) {
      // 빌드 시점에 public/img/diagram/servers의 파일 목록으로 채워진다. (electron.vite.config.mjs)
      commit('diagramUpdate', __DIAGRAMS__)
    }
  },
  modules: {}
}
