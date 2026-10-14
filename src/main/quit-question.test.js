import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { mayQuit, quitQuestion } from './quit-question.js'

describe('the question before Quit in the tray', () => {
  it('says how many terminals are still running, and that quitting ends them', () => {
    expect(quitQuestion(1).message).toBe('1 terminal is still running.')
    expect(quitQuestion(3).message).toBe('3 terminals are still running.')
    expect(quitQuestion(3).detail).toBe('Quitting closes them and ends their connections.')
  })

  // Enter와 Esc는 취소다: 실수로 접속을 끝내지 않는다
  it('has Cancel as the button of Enter and Esc', () => {
    const question = quitQuestion(2)
    expect(question.buttons).toEqual(['Quit', 'Cancel'])
    expect(question.defaultId).toBe(1)
    expect(question.cancelId).toBe(1)
    // Windows는 단추 이름이 정해져 있지 않으면 그것을 큰 명령 링크로 바꾼다: 두 단추로 둔다
    expect(question.noLink).toBe(true)
  })
})

describe('mayQuit', () => {
  it('does not ask while no terminal runs', async () => {
    const ask = vi.fn(() => 1)
    expect(await mayQuit(0, ask)).toBe(true)
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks while terminals run, and lets the app quit only on Quit', async () => {
    const ask = vi.fn(async () => 0)
    expect(await mayQuit(2, ask)).toBe(true)
    expect(ask).toHaveBeenCalledWith(quitQuestion(2))
    expect(await mayQuit(1, async () => 1)).toBe(false)
    expect(await mayQuit(1, () => 1)).toBe(false)
    expect(await mayQuit(1, () => undefined)).toBe(false)
  })

  // 끝낼 수 없는 앱이 되어서는 안 된다
  it('lets the app quit when the question cannot be asked', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await mayQuit(1, () => { throw new Error('no dialog') })).toBe(true)
    expect(await mayQuit(1, async () => { throw new Error('no dialog') })).toBe(true)
    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })
})

// main/index.js는 Electron 없이 돌릴 수 없다: 소스에서 읽는다.
describe('main: Quit in the tray, and the window hidden to the tray', () => {
  const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8').replace(/\r\n/g, '\n')

  it('asks with the number of running terminals before Quit in the tray, without stopping main while it asks', () => {
    const menu = index.match(/tray\.setContextMenu\(Menu\.buildFromTemplate\(\[\n([\s\S]*?)\n {4}\]\)\)/)?.[1] ?? ''
    expect(menu).toMatch(/label: 'Quit',\n\s+type: 'normal',\n\s+click: \(\) => quitFromTray\(\)\n\s+\}$/)
    const quit = index.match(/\n {2}async function quitFromTray\(\) \{\n([\s\S]*?)\n {2}\}\n/)?.[1] ?? ''
    expect(quit).toMatch(/^\s+if \(isAskingToQuit\) return\n\s+isAskingToQuit = true\n\s+const quit = await mayQuit\(terminals\.running, async options => \(await dialog\.showMessageBox\(options\)\)\.response\)\n\s+isAskingToQuit = false\n\s+if \(!quit\) return\n\s+isQuitting = true\n\s+app\.quit\(\)$/)
  })

  // owner: 트레이로 갈 때는 터미널을 그대로 둔다. 묻는 것은 트레이의 Quit뿐이다.
  it('hides the window to the tray without asking and without ending its terminals', () => {
    const close = index.match(/win\.on\('close', event => \{\n([\s\S]*?)\n {2}\}\)\n/)?.[1] ?? ''
    expect(close).toMatch(/if \(!isQuitting && getSetting\(\)\.isHideToTrayOnClose\) \{\n\s+event\.preventDefault\(\)\n\s+win\.setSkipTaskbar\(true\)\n\s+win\.hide\(\)\n\s+\}/)
    expect(close).not.toMatch(/mayQuit|terminals|dialog/)
  })
})
