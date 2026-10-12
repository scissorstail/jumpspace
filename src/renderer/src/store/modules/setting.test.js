import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTING } from '../../../../shared/setting.js'
import setting, { SAVE_DELAY_MS } from './setting'

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
    const stored = { gitBashPath: 'D:\\Git\\git-bash.exe', isHideToTrayOnClose: true, openIn: 'window', theme: 'vapor-blue', backdrop: 'crt', terminalColors: 'vivid', nodeBlur: 0, terminalFontSize: 15, hideNodeInfo: true }
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

  // 터미널 글꼴 크기: 키를 누를 때마다 바로 보이고, 파일에는 멈춘 뒤에 한 번 쓴다.
  it('changes a value at once and saves once after the changes have stopped', async () => {
    vi.useFakeTimers()
    const setSetting = vi.fn(async value => value)
    vi.stubGlobal('window', { preload: { setSetting } })
    const state = JSON.parse(JSON.stringify(setting.state))
    const context = { state, commit: (name, value) => setting.mutations[name](state, value) }

    setting.actions.settingChange(context, { terminalFontSize: 14 })
    expect(state.setting).toEqual({ ...DEFAULT_SETTING, terminalFontSize: 14 })
    expect(setSetting).not.toHaveBeenCalled()

    vi.advanceTimersByTime(SAVE_DELAY_MS - 1)
    setting.actions.settingChange(context, { terminalFontSize: 15 })
    vi.advanceTimersByTime(SAVE_DELAY_MS - 1)
    expect(setSetting).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(setSetting).toHaveBeenCalledOnce()
    expect(setSetting).toHaveBeenCalledWith({ ...DEFAULT_SETTING, terminalFontSize: 15 })
    vi.useRealTimers()
  })

  it('changes only to a value main would accept', () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { preload: { setSetting: vi.fn(async value => value) } })
    const state = JSON.parse(JSON.stringify(setting.state))

    setting.actions.settingChange({ state, commit: (name, value) => setting.mutations[name](state, value) }, { terminalFontSize: 999, theme: 'bogus' })
    expect(state.setting).toEqual({ ...DEFAULT_SETTING, terminalFontSize: 32 })
    vi.useRealTimers()
  })
})
