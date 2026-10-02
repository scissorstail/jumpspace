import { describe, expect, it } from 'vitest'
import { normalizeSetting } from '../shared/setting.js'
import { createSettingStore } from './setting-store.js'

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
