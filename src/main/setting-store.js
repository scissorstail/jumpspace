import { normalizeSetting } from '../shared/setting.js'

// 세팅 값 저장 (기존 버전과 같은 형식: key 'setting'에 JSON 문자열). store는 get/set이 있는 electron-store다.
// 깨진 값이나 모르는 값은 기본값으로 읽는다.
export function createSettingStore(store) {
  return {
    get() {
      try {
        return normalizeSetting(JSON.parse(store.get('setting') || '{}'))
      } catch {
        return normalizeSetting()
      }
    },
    set(data) {
      const setting = normalizeSetting(data)
      store.set('setting', JSON.stringify(setting))
      return setting
    }
  }
}
