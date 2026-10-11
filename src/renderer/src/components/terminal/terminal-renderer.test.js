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

// main이 연 세션을 탭의 화면에 잇는 일은 처음 열 때와 다시 접속할 때 같은 한 곳에서 한다.
describe('attaching a session to its screen', () => {
  const attach = panel.match(/\n {4}attach\(session, entry, \{ id, windowsPty \}\) \{\n([\s\S]*?)\n {4}\},/)?.[1] ?? ''

  // 늦으면 패널이 높아질 때 지난 출력이 빈 줄로 덮인다 (ConPTY)
  it('tells xterm about the Windows pty before any output is taken', () => {
    const told = attach.indexOf('if (windowsPty) entry.term.options.windowsPty = windowsPty')
    const taken = attach.indexOf('this.router.register(id, data => entry.term.write(data))')

    expect(told).toBeGreaterThan(-1)
    expect(taken).toBeGreaterThan(told)
  })

  it('is the one place that takes the output, for a new session and a reconnected one', () => {
    expect(panel.match(/this\.router\.register\(/g)).toHaveLength(1)
    expect(panel.match(/this\.attach\(session, entry, result\)/g)).toHaveLength(2)
    expect(attach).toContain("this.$store.commit('terminalUpdate', { key: session.key, id, status: 'running' })")
    expect(attach).toContain('this.fit(entry, true)')
  })
})
