import { DEFAULT_SETTING as defaultSetting, normalizeSetting } from '../../../../shared/setting.js'

// settingChange가 파일에 쓰기까지 기다리는 시간. 키를 누르고 있는 동안처럼 잇달아 바뀌면 멈춘 뒤에 한 번만 쓴다.
export const SAVE_DELAY_MS = 300
let saveTimer = null

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
    },
    // 값 몇 개만 바꾼다 (터미널 글꼴 크기). 화면에는 바로 반영하고, 파일에는 잠시 뒤에 그때의 설정을 쓴다:
    // 저장을 기다렸다가 반영하면 빠르게 누른 키가 같은 값에서 다시 계산되고, 누를 때마다 파일을 쓰게 된다.
    settingChange({ commit, state }, patch) {
      commit('settingUpdate', normalizeSetting({ ...state.setting, ...patch }))
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        window.preload.setSetting(state.setting).catch(e => console.error(e))
      }, SAVE_DELAY_MS)
    }
  },
  modules: {}
}
