import omitBy from 'lodash/omitBy'
import isNil from 'lodash/isNil'

const defaultSetting = {
  gitBashPath: '%ProgramFiles%\\Git\\git-bash.exe',
  isHideToTrayOnClose: false,
  openIn: 'app',
  theme: 'neon-night'
}

export default {
  state: {
    setting: { ...defaultSetting }
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
      const storedSetting = omitBy( // Remove null, undefined, '', ' '
        (await window.preload.getSetting()) || {},
        x => isNil(x) || String(x).trim() === ''
      )

      commit('settingUpdate', { ...defaultSetting, ...storedSetting })
    },
    async settingSave({ commit }, payload) {
      // main에서 검증/보정한 값을 그대로 반영한다.
      commit('settingUpdate', await window.preload.setSetting(payload))
    }
  },
  modules: {}
}
