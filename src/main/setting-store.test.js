import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Conf from 'conf'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeSetting } from '../shared/setting.js'
import { createSettingStore, STORE_OPTIONS } from './setting-store.js'

function fakeStore(initial) {
  const data = new Map(initial === undefined ? [] : [['setting', initial]])
  return { get: key => data.get(key), set: (key, value) => data.set(key, value), data }
}

describe('createSettingStore', () => {
  it('reads defaults when nothing or something broken is stored', () => {
    expect(createSettingStore(fakeStore()).get()).toEqual(normalizeSetting())
    expect(createSettingStore(fakeStore('{broken')).get()).toEqual(normalizeSetting())
    expect(createSettingStore(fakeStore('null')).get()).toEqual(normalizeSetting())
  })

  it('stores the normalized setting as a JSON string under "setting" and reads it back', () => {
    const store = fakeStore()
    const settings = createSettingStore(store)
    const saved = settings.set({ ...normalizeSetting(), theme: 'vapor-blue', unknown: 1 })
    expect(saved.theme).toBe('vapor-blue')
    expect(saved).not.toHaveProperty('unknown')
    expect(typeof store.data.get('setting')).toBe('string')
    expect(JSON.parse(store.data.get('setting'))).toEqual(saved)
    expect(settings.get()).toEqual(saved)
  })

  it('keeps reading values saved by older versions', () => {
    expect(createSettingStore(fakeStore(JSON.stringify({ gitBashPath: 'C:\\Git\\git-bash.exe' }))).get().gitBashPath).toBe('C:\\Git\\git-bash.exe')
  })
})

// 설정 파일(config.json)이 깨졌을 때. electron-store는 Electron 없이는 불러올 수 없어서, 받은 옵션을 그대로 넘겨받는
// conf(electron-store의 바탕)로 본다. main은 창을 띄우기 전에 store를 만들고, 거기서 던지면 앱이 뜨지 못한다.
describe('a damaged config.json', () => {
  const dirs = []
  const folderWith = text => {
    const cwd = mkdtempSync(join(tmpdir(), 'jumpspace-config-'))
    dirs.push(cwd)
    writeFileSync(join(cwd, 'config.json'), text)
    return cwd
  }
  // electron-store가 conf에 주는 것과 같다: 이름은 'config', 폴더는 userData
  const open = (cwd, options) => new Conf({ cwd, configName: 'config', ...options })
  // 정전 뒤에 남을 수 있는 것들
  const damaged = [
    ['empty', ''],
    ['cut off', '{"setting":"{\\"theme\\":\\"vapor-blue\\"'],
    ['full of NUL bytes', '\u0000'.repeat(64)]
  ]

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it.each(damaged)('%s: the store opens and the setting is the default one', (name, text) => {
    const settings = createSettingStore(open(folderWith(text), STORE_OPTIONS))

    expect(settings.get()).toEqual(normalizeSetting())
  })

  it.each(damaged)('%s: the next write leaves a file that can be read again', (name, text) => {
    const cwd = folderWith(text)
    createSettingStore(open(cwd, STORE_OPTIONS)).set({ ...normalizeSetting(), theme: 'vapor-blue' })

    expect(JSON.parse(JSON.parse(readFileSync(join(cwd, 'config.json'), 'utf8')).setting).theme).toBe('vapor-blue')
    expect(createSettingStore(open(cwd)).get().theme).toBe('vapor-blue')
  })

  // 이 옵션이 없으면 생성자가 던진다 (그래서 옵션이 있다). 라이브러리의 기본값이 바뀌면 이 테스트가 알려 준다.
  it.each(damaged)('%s: without the option the store cannot be opened at all', (name, text) => {
    expect(() => open(folderWith(text))).toThrow(/JSON/)
  })

  it('a file that is fine is read as it is', () => {
    const stored = { setting: JSON.stringify({ theme: 'sunset-drive' }), window: { x: 1, y: 2, width: 800, height: 600, isMaximized: false } }
    const store = open(folderWith(JSON.stringify(stored)), STORE_OPTIONS)

    expect(createSettingStore(store).get().theme).toBe('sunset-drive')
    expect(store.get('window')).toEqual(stored.window)
  })

  it('main opens its one store with these options', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8')

    expect(source).toMatch(/const store = new Store\(STORE_OPTIONS\)/)
    expect(source.match(/new Store\(/g)).toHaveLength(1)
  })
})
