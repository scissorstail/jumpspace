import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 터미널의 선과 블록 문자는 xterm.js가 직접 그려야 줄 사이가 끊기지 않는다 (WebGL 그리기). 소스에서 읽는다: DOM 없이 도는 테스트라서.
const here = dirname(fileURLToPath(import.meta.url))
const panel = readFileSync(join(here, 'terminal-panel.vue'), 'utf8').replace(/\r\n/g, '\n')
const method = panel.match(/\n {4}drawWithWebgl\(term\) \{\n([\s\S]*?)\n {4}\},/)?.[1] ?? ''

describe('the renderer of the app terminal', () => {
  it('is the WebGL one, loaded once the terminal is on the page', () => {
    expect(panel).toMatch(/term\.open\(el\)\n\s+this\.drawWithWebgl\(term\)\n/)
    expect(method).toContain('term.loadAddon(webgl)')
  })

  // 브라우저는 WebGL 컨텍스트를 16개쯤까지만 둔다: 거두어진 터미널은 기본 그리기로 돌아가야 화면이 남는다.
  it('gives way to the default renderer when the context is lost or WebGL is not there', () => {
    expect(method).toContain('webgl.onContextLoss(() => webgl.dispose())')
    expect(method).toMatch(/try \{[\s\S]*\} catch \(e\) \{/)
  })
})
