export default {
  state: {
    diagram: []
  },
  getters: {
    diagram (state) {
      return state.diagram
    }
  },
  mutations: {
    diagramUpdate (state, payload) {
      state.diagram = payload
    }
  },
  actions: {
    async diagramLoad ({ commit }) {
      const diagramNames = await window.readDiagramDirSync('/servers')
      commit('diagramUpdate', diagramNames)
    }
  },
  modules: {
  }
}
