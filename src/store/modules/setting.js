export default {
  state: {
    setting: {
      gitBashPath: null,
      isHideToTrayOnClose: null
    }
  },
  getters: {
    setting(state) {
      return state.setting
    }
  },
  mutations: {
    settingUpdate(state, payload) {
      state.setting = { ...payload }
    }
  },
  actions: {
    async settingLoad({ commit }) {
      const defaultSetting = {
        gitBashPath: '%ProgramFiles%\\Git\\git-bash.exe',
        isHideToTrayOnClose: false
      }

      const setting = await window.ipcRenderer.sendSync('getStore')
      commit(
        'settingUpdate',
        JSON.parse(setting || JSON.stringify(defaultSetting))
      )
    },
    async settingSave({ state, commit }, payload) {
      commit('settingUpdate', payload)

      window.ipcRenderer.send('setStore', JSON.stringify(state.setting))
    }
  },
  modules: {}
}
