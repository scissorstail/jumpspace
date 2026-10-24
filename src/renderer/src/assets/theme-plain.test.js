import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { compile } from 'sass'
import { describe, expect, it } from 'vitest'
import { THEMES } from '../../../shared/setting.js'

// Plain (owner, 2026-10-24: 덜 튀는 밝은 유리 모양, 회사에서도 쓴다). 색은 theme.scss의 블록이고, 모양을 바꾸는 규칙은
// theme-plain.scss다. 그 파일을 Sass로 풀어서 규칙 하나하나를 읽는다.
const css = compile(join(__dirname, 'theme-plain.scss')).css
const rules = [...css.replace(/@font-face\s*\{[^}]*\}/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
  selectors: selectors.split(',').map(x => x.trim()),
  body
}))
const value = (body, property) => body.match(new RegExp(`(?:^|[\\s;])${property}: ([^;]+);`))?.[1]
const rootVars = rules.find(rule => rule.selectors.length === 1 && rule.selectors[0] === ':root[data-theme=plain]')?.body || ''

const theme = readFileSync(join(__dirname, 'theme.scss'), 'utf8').replace(/\r\n/g, '\n')
const plainColors = Object.fromEntries(
  [...(theme.match(/:root\[data-theme='plain'\] \{\n([^}]+)\}/)?.[1] || '').matchAll(/(--js-[a-z0-9-]+): (#[0-9a-f]{6});/g)].map(([, key, hex]) => [key, hex])
)

const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

describe('the Plain palette', () => {
  it('is a theme of the settings with its colors in theme.scss', () => {
    expect(THEMES).toContain('plain')
    for (const name of ['--js-bg', '--js-surface', '--js-text', '--js-primary', '--js-danger', '--js-live', '--js-connecting']) {
      expect(plainColors[name], name).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  // 다른 색 묶음에는 아무 일도 하지 않는다: 모든 규칙이 :root[data-theme=plain] 안이다
  it('changes nothing outside Plain', () => {
    expect(rules.length).toBeGreaterThan(40)
    for (const { selectors } of rules) {
      for (const selector of selectors) expect(selector).toMatch(/^:root\[data-theme=plain\](?:$| )/)
    }
  })

  it('writes in the normal font, without capitals or wide spacing', () => {
    expect(value(rootVars, '--js-font-display')).toMatch(/^'JS Plain', 'Pretendard Variable'/)
    expect(value(rootVars, '--js-caps')).toBe('none')
    expect(value(rootVars, '--js-tracking')).toBe('normal')
    expect(css).toMatch(/font-family: "JS Plain";[^}]*size-adjust: \d+%;[^}]*PretendardVariable\.woff2/)
  })

  it('has no bands of three colors and no hard shadows', () => {
    expect(value(rootVars, '--js-bands')).toBe('none')
    // 흐린 그림자: 흐림 반경이 0이 아니다
    expect(value(rootVars, '--js-drop')).toMatch(/^0 1px 2px rgba\(/)
    const bands = rules.filter(rule => rule.selectors.some(x => /::before$|::after$/.test(x)) && value(rule.body, 'display') === 'none').flatMap(rule => rule.selectors)
    for (const band of ['.modal-content::before', '.card::before', '#main-header::after', '.vt-popover-inner::before']) {
      expect(bands, band).toContain(`:root[data-theme=plain] ${band}`)
    }
  })

  // 캔버스 위에 뜨는 판은 흰 반투명 유리이고 뒤를 흐린다 (목록 판은 그 ::before가, 아래 테스트)
  it.each(['.dropdown-menu', '.modal-content', '.b-toast .toast', '#diagram-switcher::before', 'div.context-menu', '.vt-popover-inner', '.terminal-search'])('draws %s as frosted glass', selector => {
    const rule = rules.find(r => r.selectors.includes(`:root[data-theme=plain] ${selector}`) && value(r.body, 'backdrop-filter'))

    expect(rule, selector).toBeDefined()
    expect(value(rule.body, 'backdrop-filter')).toMatch(/^blur\(\d+px\)/)
    const alpha = Number(value(rule.body, 'background')?.match(/^rgba\(255, 255, 255, (0?\.\d+)\)$/)?.[1])
    expect(alpha).toBeGreaterThan(0.5)
    expect(alpha).toBeLessThan(1)
  })

  // 노드 상자는 뒤를 흐리지 않는다: backdrop-filter가 있는 판 안에서는 그 안의 Node glass(.info-card)가 노드 뒤를 보지 못한다
  it('leaves the node box without a backdrop filter, so that Node glass under it still blurs', () => {
    const node = rules.filter(r => r.selectors.some(x => x.startsWith(':root[data-theme=plain] #rete') && x.includes('.node.site')))

    expect(node.length).toBeGreaterThan(0)
    for (const rule of node) expect(value(rule.body, 'backdrop-filter'), rule.selectors.join(', ')).toBeUndefined()
  })

  // backdrop-filter는 메뉴나 다른 유리를 담지 않은 판에만 둔다 (#291). 그 필터를 가진 요소는 그 안의 position: fixed 요소의 기준
  // 상자가 되고(목록 판 안의 메뉴가 판의 자리만큼 밀려 열렸다), 그 안의 유리가 흐리는 범위도 된다(그 메뉴는 캔버스를 흐리지
  // 못했다). 새 유리판은 여기에 넣기 전에 그 안에 무엇이 뜨는지 본다. (headless의 hover-shift-check가 페이지에서도 본다)
  it('puts a backdrop filter only on panels that hold no menu and no other glass', () => {
    const glass = rules.filter(r => value(r.body, 'backdrop-filter')).flatMap(r => r.selectors.map(x => x.replace(':root[data-theme=plain] ', '')))
    const leaves = ['.dropdown-menu', '.modal-content', '.card', '.modal-backdrop', '.b-overlay > div:first-child', '.b-toast .toast', '.b-toast.b-toast-solid .toast', '#diagram-switcher::before', '.terminal-search', 'div.context-menu', '.menu-button', '.vt-popover-inner']

    expect(glass.sort()).toEqual([...leaves].sort())
  })

  // 목록 판의 유리와 테두리는 ::before에 있고, 판은 메뉴를 품되 흐리지 않는다
  it('draws the glass of the space list behind it, not on it', () => {
    const own = rules.filter(r => r.selectors.includes(':root[data-theme=plain] #diagram-switcher'))
    const behind = rules.find(r => r.selectors.includes(':root[data-theme=plain] #diagram-switcher::before'))?.body || ''

    expect(own.length).toBeGreaterThan(0)
    for (const rule of own) {
      expect(value(rule.body, 'backdrop-filter'), rule.selectors.join(', ')).toBeUndefined()
      expect(value(rule.body, 'filter'), rule.selectors.join(', ')).toBeUndefined()
    }
    expect(own.map(r => value(r.body, 'background')).filter(Boolean)).toEqual(['transparent'])
    expect(own.map(r => value(r.body, 'border')).filter(Boolean)).toEqual(['1px solid transparent'])
    expect(value(behind, 'position')).toBe('absolute')
    expect(value(behind, 'inset')).toBe('-1px')
    expect(value(behind, 'z-index')).toBe('-1')
    expect(value(behind, 'pointer-events')).toBe('none')
    expect(value(behind, 'border')).toBe('1px solid rgba(29, 36, 48, 0.12)')
  })

  // Node glass를 켜면 글자 묶음은 유리판 하나 위에 있다: 이름과 줄마다의 칸은 없다 (켜지 않았을 때는 흰 칸이 글자를 받친다)
  it('leaves the text under a node without boxes of its own on Node glass', () => {
    const box = selector => rules.filter(r => r.selectors.includes(`:root[data-theme=plain] ${selector}`)).map(r => value(r.body, 'background')).filter(Boolean)

    expect(box('.info-name')).toEqual(['rgba(255, 255, 255, 0.72)'])
    expect(box('.info-text')).toEqual(['rgba(255, 255, 255, 0.6)'])
    expect(box('.node-glass #rete .info-name')).toEqual(['transparent'])
    expect(box('.node-glass #rete .info-text')).toEqual(['transparent'])
  })

  // 설정의 스위치 (owner, 2026-10-17, #256: 손잡이가 옮겨 가는 것이 보여야 한다). 손잡이는 어느 쪽에서나 그림자 진 흰 칸이고,
  // 홈이 꺼지면 회색, 켜지면 파랑이다. 밤의 모양(흐린 손잡이, 바탕색 홈) 그대로면 켜진 흰 손잡이가 꺼진 스위치의 빈 반쪽과 같은 색이다.
  it('moves a white knob between a grey track and a blue one', () => {
    // 그 선택자의 규칙 가운데 그 속성을 정하는 것 (모서리만 정하는 규칙도 같은 선택자를 쓴다)
    const color = selector => rules.filter(r => r.selectors.includes(`:root[data-theme=plain] ${selector}`)).map(r => r.body).find(body => value(body, 'background-color')) || ''
    const knob = color('.custom-switch .custom-control-label::after')

    expect(value(knob, 'background-color')).toBe('var(--js-surface)')
    expect(color('.custom-switch .custom-control-input:checked ~ .custom-control-label::after')).toBe(knob)
    expect(value(knob, 'box-shadow')).toMatch(/^0 1px 2px rgba\(/)
    expect(value(color('.custom-switch .custom-control-label::before'), 'background-color')).toBe('var(--js-line)')
    expect(value(color('.custom-switch .custom-control-input:checked ~ .custom-control-label::before'), 'background-color')).toBe('var(--js-primary)')
    expect(contrast(plainColors['--js-surface'], plainColors['--js-line'])).toBeGreaterThan(1.3)
    expect(contrast(plainColors['--js-surface'], plainColors['--js-primary'])).toBeGreaterThan(4.5)
  })

  // 흰 바탕의 글자: 주색 위의 흰 글자(단추)와 바탕 위의 흐린 글자
  it('can be read', () => {
    expect(contrast(plainColors['--js-on-primary'], plainColors['--js-primary'])).toBeGreaterThan(4.5)
    expect(contrast(plainColors['--js-text'], plainColors['--js-bg'])).toBeGreaterThan(12)
    expect(contrast(plainColors['--js-text-muted'], plainColors['--js-surface'])).toBeGreaterThan(4.5)
  })
})

// 대문자와 넓은 자간은 Plain이 변수로 끈다. 규칙에 그대로 쓰면 Plain에서도 대문자가 된다.
describe('capitals and letter spacing in the styles', () => {
  const root = join(__dirname, '..')
  const styles = dir =>
    readdirSync(dir).flatMap(entry => {
      const path = join(dir, entry)
      return statSync(path).isDirectory() ? styles(path) : /\.(scss|vue)$/.test(entry) ? [path] : []
    })
  const lines = styles(root).flatMap(path =>
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map(line => ({ where: relative(root, path), line: line.trim() }))
  )

  it('go through --js-caps and --js-tracking', () => {
    const caps = lines.filter(({ line }) => /^text-transform:/.test(line))
    const tracking = lines.filter(({ line }) => /^letter-spacing:/.test(line))

    expect(caps.length).toBeGreaterThan(10)
    for (const { where, line } of caps) expect(line, where).toBe('text-transform: var(--js-caps, uppercase);')
    for (const { where, line } of tracking) expect(line, where).toMatch(/^letter-spacing: (?:var\(--js-tracking, \d*\.\d+em\)|0);$/)
  })
})
