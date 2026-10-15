import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 터미널에 지나간 출력에서 찾기 (Ctrl+Shift+F). 소스에서 읽는다: DOM 없이 도는 테스트라서.
const here = dirname(fileURLToPath(import.meta.url))
const read = name => readFileSync(join(here, name), 'utf8').replace(/\r\n/g, '\n')
const search = read('terminal-search.vue')
const panel = read('terminal-panel.vue')

describe('the search field of the terminal panel', () => {
  // 새 출력은 아래에 있다: Enter는 위로 간다
  it('goes to the match before with Enter, to the next with Shift+Enter, and closes with Esc', () => {
    expect(search).toMatch(/@keydown\.enter\.exact\.prevent="\$emit\('find', 'previous'\)"/)
    expect(search).toMatch(/@keydown\.enter\.shift\.exact\.prevent="\$emit\('find', 'next'\)"/)
    expect(search).toMatch(/@keydown\.esc\.stop\.prevent="\$emit\('close'\)"/)
  })

  it('has buttons for the same, which need a text to find', () => {
    expect(search).toMatch(/aria-label="Previous match"\n\s+title="Previous match \(Enter\)"\n\s+:disabled="value === ''"\n\s+@click="\$emit\('find', 'previous'\)"/)
    expect(search).toMatch(/aria-label="Next match"\n\s+title="Next match \(Shift\+Enter\)"\n\s+:disabled="value === ''"\n\s+@click="\$emit\('find', 'next'\)"/)
    expect(search).toMatch(/aria-label="Close find"\n\s+title="Close \(Esc\)"\n\s+@click="\$emit\('close'\)"/)
  })

  // 대소문자 구분 (owner, 2026-10-15): 작은 글자 단추. 마우스로 눌러도 키보드는 입력칸에 남는다.
  it('has a small button that makes case matter, says whether it is on, and leaves the keyboard in the field', () => {
    expect(search).toMatch(/class="terminal-search-button terminal-search-case"\n\s+:class="\{ 'is-on': caseSensitive \}"\n\s+aria-label="Match case"\n\s+title="Match case"\n\s+:aria-pressed="caseSensitive \? 'true' : 'false'"\n\s+@mousedown\.prevent\n\s+@click="\$emit\('toggle-case'\)"\n\s+>\n\s+Aa\n/)
    expect(search).toMatch(/caseSensitive: \{ type: Boolean, default: false \}/)
  })

  it('says when the text is not in the terminal', () => {
    expect(search).toMatch(/:class="\{ 'is-missing': isMissing \}"/)
    expect(search).toMatch(/v-show="isMissing"\n\s+class="terminal-search-missing"\n\s+role="status"\n\s+>No match<\/span>/)
  })
})

// 패널이 찾는 칸을 어떻게 잇는지. 찾는 일 자체(find, openSearch, closeSearch)는 terminal-panel-methods.test.js가 돌려 본다.
describe('finding in a terminal', () => {
  it('is on for every terminal', () => {
    expect(panel).toMatch(/const search = new SearchAddon\(\)\n\s+term\.loadAddon\(fit\)\n\s+term\.loadAddon\(search\)\n\s+const entry = \{ term, fit, search, /)
  })

  it('opens with the key, over the half that is selected', () => {
    expect(panel).toMatch(/\} else if \(shortcut === 'find'\) \{\n\s+this\.openSearch\(\)\n/)
    expect(panel).toMatch(/v-if="search\.isOpen"\n\s+ref="search"\n\s+v-model="search\.text"\n\s+:class="\{ 'is-left': isSplit && activeKey === panes\.left \}"/)
  })

  it('starts again while typing, and moves from the match with the keys and buttons of the field', () => {
    expect(panel).toMatch(/@input="find\('first'\)"\n\s+@find="find"\n\s+@toggle-case="toggleCase"\n\s+@close="closeSearch"/)
  })

  it('shows the field whether case matters', () => {
    expect(panel).toMatch(/:is-missing="search\.isMissing"\n\s+:case-sensitive="search\.caseSensitive"\n/)
  })
})
