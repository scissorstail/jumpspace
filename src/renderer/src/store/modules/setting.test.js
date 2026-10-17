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
    const stored = { gitBashPath: 'D:\\Git\\git-bash.exe', isHideToTrayOnClose: true, openIn: 'window', theme: 'vapor-blue', backdrop: 'crt', terminalColors: 'vivid', nodeBlur: 0, terminalFontSize: 15, hideNodeInfo: true, showRecentSpaces: false }
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

  // 파일에 쓰지 못해도 (디스크, 권한) 화면의 값은 남고, 처리되지 않은 거부로 끝나지 않는다
  it('keeps the changed value and reports it when the delayed save fails', async () => {
    vi.useFakeTimers()
    const failure = new Error('disk full')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('window', { preload: { setSetting: vi.fn(async () => { throw failure }) } })
    const state = JSON.parse(JSON.stringify(setting.state))

    setting.actions.settingChange({ state, commit: (name, value) => setting.mutations[name](state, value) }, { terminalFontSize: 20 })
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)

    expect(error).toHaveBeenCalledWith(failure)
    expect(state.setting.terminalFontSize).toBe(20)
    error.mockRestore()
    vi.useRealTimers()
  })

  // 설정 창의 저장(settingSave)이 사이에 와도, 늦은 저장은 그때의 설정을 쓴다: 옛 값으로 덮지 않는다
  it('writes the setting of the moment it saves, not of the moment it was asked', async () => {
    vi.useFakeTimers()
    const setSetting = vi.fn(async value => value)
    vi.stubGlobal('window', { preload: { setSetting } })
    const state = JSON.parse(JSON.stringify(setting.state))
    const context = { state, commit: (name, value) => setting.mutations[name](state, value) }

    setting.actions.settingChange(context, { terminalFontSize: 18 })
    await setting.actions.settingSave(context, { ...state.setting, theme: 'vapor-blue' })
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS)

    expect(setSetting).toHaveBeenLastCalledWith({ ...DEFAULT_SETTING, terminalFontSize: 18, theme: 'vapor-blue' })
    expect(state.setting).toEqual({ ...DEFAULT_SETTING, terminalFontSize: 18, theme: 'vapor-blue' })
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
