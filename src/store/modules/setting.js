export default {
  state: {
    setting: {
      gitBashPath: localStorage.gitBashPath || '%ProgramFiles%\\Git\\git-bash.exe'
    }
  },
  getters: {
    setting (state) {
      return state.setting
    }
  },
  mutations: {
    settingUpdate (state, payload) {
      state.setting = { ...payload }

      for (const key in state.setting) {
        localStorage[key] = state.setting[key]
      }
    }
  },
  actions: {
  },
  modules: {
  }
}
