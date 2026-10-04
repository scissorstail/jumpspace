import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTING } from '../../../../shared/setting.js'
import setting from './setting'

function run(action, preload, payload) {
  vi.stubGlobal('window', { preload })
  const state = JSON.parse(JSON.stringify(setting.state))
  const commit = (name, value) => setting.mutations[name](state, value)
  return setting.actions[action]({ commit }, payload).then(() => state.setting)
}

afterEach(() => vi.unstubAllGlobals())

describe('setting store', () => {
  it('starts with the defaults', () => {
    expect(setting.state.setting).toEqual(DEFAULT_SETTING)
  })

  it('loads the stored setting', async () => {
    const stored = { gitBashPath: 'D:\\Git\\git-bash.exe', isHideToTrayOnClose: true, openIn: 'window', theme: 'vapor-blue', backdrop: 'crt', nodeBlur: 0, hideNodeInfo: true }
    expect(await run('settingLoad', { getSetting: async () => stored })).toEqual(stored)
  })

  it('falls back to the defaults for missing or unknown values, with the same rules as main', async () => {
    expect(await run('settingLoad', { getSetting: async () => null })).toEqual(DEFAULT_SETTING)
    const loaded = await run('settingLoad', { getSetting: async () => ({ gitBashPath: '  ', theme: 'bogus', backdrop: 'off', nodeBlur: 999, extra: 1 }) })
    expect(loaded).toEqual({ ...DEFAULT_SETTING, backdrop: 'off', nodeBlur: 20 })
  })

  it('keeps what main answers when saving', async () => {
    const answer = { ...DEFAULT_SETTING, theme: 'sunset-drive' }
    const setSetting = vi.fn(async () => answer)
    expect(await run('settingSave', { setSetting }, { ...DEFAULT_SETTING, theme: 'sunset-drive', nodeBlur: -3 })).toEqual(answer)
    expect(setSetting).toHaveBeenCalledOnce()
  })
})
