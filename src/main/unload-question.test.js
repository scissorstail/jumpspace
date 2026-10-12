import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { UNSAVED_TEXT, UNSAVED_TITLE } from '../shared/unsaved.js'
import { mayUnload, UNLOAD_QUESTION } from './unload-question.js'

describe('the question before the window closes with the editor unlocked', () => {
  it('says what is lost, in the words of the question before another diagram is opened', () => {
    expect(UNLOAD_QUESTION.title).toBe(UNSAVED_TITLE)
    expect(UNLOAD_QUESTION.message).toBe(UNSAVED_TEXT)
    expect(UNSAVED_TEXT).toMatch(/saved only when you lock it again\. They will be lost\.$/)
  })

  // Enter와 Esc는 취소다
  it('has Cancel as the button of Enter and Esc', () => {
    expect(UNLOAD_QUESTION.buttons).toEqual(['Discard changes', 'Cancel'])
    expect(UNLOAD_QUESTION.defaultId).toBe(1)
    expect(UNLOAD_QUESTION.cancelId).toBe(1)
  })
})

describe('mayUnload', () => {
  it('lets the window go only when the changes are given up', () => {
    const ask = vi.fn(() => 0)
    expect(mayUnload(ask)).toBe(true)
    expect(ask).toHaveBeenCalledWith(UNLOAD_QUESTION)
    expect(mayUnload(() => 1)).toBe(false)
    expect(mayUnload(() => undefined)).toBe(false)
  })

  // 닫을 수 없는 창이 되어서는 안 된다
  it('lets the window go when the question cannot be asked', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(mayUnload(() => { throw new Error('no dialog') })).toBe(true)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

// main/index.js는 Electron 없이 돌릴 수 없다: 소스에서 읽는다.
describe('main, when the page holds the window', () => {
  const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8').replace(/\r\n/g, '\n')
  const handler = index.match(/win\.webContents\.on\('will-prevent-unload', event => \{\n([\s\S]*?)\n {2}\}\)\n/)?.[1] ?? ''

  it('asks in a window that can be seen, and lets the page go when the changes are given up', () => {
    expect(handler).toMatch(/const leave = mayUnload\(options => \{\n\s+if \(target\.isMinimized\(\)\) target\.restore\(\)\n\s+if \(!target\.isVisible\(\)\) target\.show\(\)\n\s+return dialog\.showMessageBoxSync\(target, options\)\n\s+\}\)/)
    expect(handler).toMatch(/if \(leave\) \{\n\s+event\.preventDefault\(\)\n/)
  })

  // 트레이의 Quit을 취소한 뒤: 닫기 단추는 다시 트레이로 숨기는 것이어야 한다
  it('forgets that the app was quitting when the answer is Cancel', () => {
    expect(handler).toMatch(/\} else \{\n\s+isQuitting = false\n/)
  })

  // before-quit는 창이 닫히기 전에, 묻기도 전에 온다: 거기서 끝내면 취소해도 터미널이 죽어 있다
  it('ends the terminals when the app really quits, not when it is asked to', () => {
    expect(index).toMatch(/app\.on\('will-quit', \(\) => terminals\.closeAll\(\)\)/)
    expect(index).not.toMatch(/app\.on\('before-quit', \(\) => terminals\.closeAll\(\)\)/)
  })
})
