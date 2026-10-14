import { normalizeSetting } from '../shared/setting.js'

// electron-store를 여는 옵션. clearInvalidConfig: 읽을 수 없는 config.json(비었거나, 잘렸거나, NUL로 찬 파일: 정전 뒤에 남을 수 있다)을
// 빈 것으로 읽는다. 기본값(false)으로는 new Store()가 SyntaxError를 던지는데, main은 창을 띄우기 전에 store를 만들기 때문에
// 그 파일을 손으로 지울 때까지 앱이 뜨지 못했다. 그 파일에는 설정과 창의 자리만 있다 (다이어그램은 projects.json).
export const STORE_OPTIONS = { clearInvalidConfig: true }

// config.json을 연다 (open: () => new Store(STORE_OPTIONS)). 깨진 내용은 STORE_OPTIONS가 빈 것으로 읽지만, 파일을 열 수조차
// 없으면(그 이름의 폴더가 있다, 권한이 없다, 다른 프로그램이 막고 있다) new Store()가 던졌다: 그때도 Electron의 오류 상자만
// 뜨고 앱은 뜨지 않았다. 그러면 기억만 하는 store로 기본 설정을 쓰고(바꾼 것은 이번 실행 동안만 남는다), 화면이 알릴 말을
// problem에 둔다 (화면은 setting:problem으로 묻는다). 파일은 손대지 않는다: 고칠 수 있는 것은 사람뿐이다 (projects.json과 같다).
//   dir: 그 파일이 있는 폴더 (알림에 보인다)
export function openStore(open, dir) {
  try {
    return { store: open(), problem: null }
  } catch (e) {
    const reason = e?.code ? `could not be opened (${e.code})` : 'could not be read'
    console.error(`Failed to open config.json in ${dir}: ${reason}`)
    return {
      store: memoryStore(),
      problem: [
        `config.json ${reason}.`,
        'The app runs with the default settings, and what is changed is kept only until it ends.',
        'Nothing was changed. Repair or remove what cannot be opened, then start the app again. The folder:',
        dir
      ].join('\n')
    }
  }
}

// 파일 없이 기억만 하는 store (main이 쓰는 get과 set만)
function memoryStore() {
  const values = new Map()
  return {
    get: key => values.get(key),
    set: (key, value) => {
      values.set(key, value)
    }
  }
}

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
