import omitBy from 'lodash/omitBy'
import isNil from 'lodash/isNil'

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
    async settingLoad({ state, commit }) {
      const defaultSetting = {
        gitBashPath: '%ProgramFiles%\\Git\\git-bash.exe',
        isHideToTrayOnClose: false
      }
      const storedSetting = omitBy( // Remove null, undefined, '', ' '
        JSON.parse((await window.preload.getStore()) || '{}'),
        x => isNil(x) || String(x).trim() === ''
      )

      // Set default setting
      const setting = { ...defaultSetting, ...storedSetting }

      commit('settingUpdate', setting)

      window.preload.setStore(JSON.stringify(state.setting))
    },
    async settingSave({ state, commit }, payload) {
      commit('settingUpdate', payload)

      window.preload.setStore(JSON.stringify(state.setting))
    }
  },
  modules: {}
}
