import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 잠금을 푼 채로 창을 닫으면 바꾼 것을 잃는다 (잠글 때 저장된다). 화면은 막기만 하고, main이 묻는다
// (src/main/unload-question.js). 소스에서 읽는다: DOM 없이 도는 테스트라서.
describe('leaving the page with the editor unlocked', () => {
  const read = name => readFileSync(join(__dirname, name), 'utf8').replace(/\r\n/g, '\n')
  const layout = read('Layout.vue')
  const navigator = read('../components/layout/main-navigator.vue')

  it('is held while a diagram is open and unlocked, the way Electron wants it', () => {
    expect(layout).toMatch(/holdUnload\(event\) \{\n\s+if \(!losesChangesOnUnload\(\{ isOpen: this\.openedItemIndex !== null, isLocked: this\.isEditorLocked \}\)\) return\n\n\s+event\.preventDefault\(\)\n\s+event\.returnValue = false\n/)
  })

  it('is watched as long as the page is there', () => {
    expect(layout).toMatch(/window\.addEventListener\('beforeunload', this\.holdUnload\)/)
    expect(layout).toMatch(/window\.removeEventListener\('beforeunload', this\.holdUnload\)/)
  })

  // 다이어그램을 바꿀 때의 질문과 같은 말이다
  it('is asked about in the words of the question before another diagram is opened', () => {
    expect(navigator).toMatch(/msgBoxConfirm\(`\$\{UNSAVED_TEXT\} Continue\?`, \{\n\s+title: UNSAVED_TITLE,/)
  })
})
