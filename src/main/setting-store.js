import { normalizeSetting } from '../shared/setting.js'

// electron-store를 여는 옵션. clearInvalidConfig: 읽을 수 없는 config.json(비었거나, 잘렸거나, NUL로 찬 파일: 정전 뒤에 남을 수 있다)을
// 빈 것으로 읽는다. 기본값(false)으로는 new Store()가 SyntaxError를 던지는데, main은 창을 띄우기 전에 store를 만들기 때문에
// 그 파일을 손으로 지울 때까지 앱이 뜨지 못했다. 그 파일에는 설정과 창의 자리만 있다 (다이어그램은 projects.json).
export const STORE_OPTIONS = { clearInvalidConfig: true }

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
