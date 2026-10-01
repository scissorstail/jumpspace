import { DEFAULT_SETTING as defaultSetting, normalizeSetting } from '../../../../shared/setting.js'

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
      // main과 같은 규칙으로 맞춘다. (없거나 모르는 값은 기본값, 모르는 키는 버린다)
      commit('settingUpdate', normalizeSetting(await window.preload.getSetting()))
    },
    async settingSave({ commit }, payload) {
      // main에서 검증/보정한 값을 그대로 반영한다.
      commit('settingUpdate', await window.preload.setSetting(payload))
    }
  },
  modules: {}
}
