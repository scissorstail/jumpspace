export default {
  state: {
    diagram: []
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
