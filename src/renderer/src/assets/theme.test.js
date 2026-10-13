import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Windows의 checkout은 줄 끝이 CRLF일 수 있다.
const theme = readFileSync(join(__dirname, 'theme.scss'), 'utf8').replace(/\r\n/g, '\n')

describe('header and diagram list buttons', () => {
  // 클릭한 단추에는 포커스가 남는다. :focus로 강조하면 마우스로 누른 단추가 계속 켜져 있다.
  it('light up on hover and keyboard focus, not on every focus', () => {
    const start = theme.indexOf('#main-header,\n#diagram-switcher {')
    const block = theme.slice(start, theme.indexOf('\n}\n', start))
    const lit = block.match(/((?:\s*&[^{,]+,)+\s*&[^{,]+)\{\s*background-color: var\(--js-hover\)/)?.[1] || ''
    expect(lit).toMatch(/&:hover/)
    expect(lit).toMatch(/&:focus-visible/)
    expect(lit).not.toMatch(/&:focus\s*,|&:focus\s*$/)
    // Bootstrap의 .btn-light:focus 배경도 끈다
    expect(block).toMatch(/&:focus \{\s*background-color: transparent;/)
  })
})

const palettes = [...theme.matchAll(/:root\[data-theme='([a-z-]+)'\] \{\n([^}]+)\}/g)].map(([, name, body]) => ({
  name,
  colors: Object.fromEntries([...body.matchAll(/(--js-[a-z0-9-]+): (#[0-9a-f]{6});/g)].map(([, key, value]) => [key, value]))
}))

// WCAG의 상대 휘도와 대비
const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

// 오류 토스트가 창의 맨 위에 뜨면 사라질 때까지 머리글의 잠금, 설정 단추를 가린다.
describe('error toasts', () => {
  it('open under the header, not over its buttons', () => {
    const top = theme.match(/\n\.b-toaster\.b-toaster-top-right \.b-toaster-slot \{\n {2}top: ([\d.]+)rem;\n\}/)?.[1]
    // 머리글 44px과 그 아래의 색 줄 4px (header-check가 실제 높이를 잰다)
    expect(Number(top) * 16).toBeGreaterThanOrEqual(48)
  })

  // 붉은 머리에 밝은 글자색의 x는 흐렸다 (대비 3 안팎, 거기에 opacity 0.8)
  it.each(['neon-night', 'sunset-drive', 'vapor-blue'])('have a title and a close button that can be read on the red header in %s', name => {
    const { colors } = palettes.find(p => p.name === name)
    const start = theme.indexOf('\n.b-toast.b-toast-danger .toast .toast-header {')
    const block = theme.slice(start, theme.indexOf('\n}\n', start))
    expect(block).toMatch(/background: var\(--js-danger\);\n {2}color: var\(--js-on-primary\);/)
    expect(block).toMatch(/\.close \{\n {4}color: var\(--js-on-primary\);\n {4}opacity: 1;\n {2}\}/)
    expect(contrast(colors['--js-on-primary'], colors['--js-danger'])).toBeGreaterThan(4.5)
    expect(contrast(colors['--js-text'], colors['--js-danger'])).toBeLessThan(4.5)
  })
})

// 그림자는 흐리지 않은 단색 판이다. 검정이던 때에는 어두운 바탕과 구별되지 않아서 그림자도, 그 위 패널의 모서리도 보이지 않았다.
describe('the color of the hard shadows', () => {
  it('is set by every palette', () => {
    expect(palettes.map(p => p.name)).toEqual(['neon-night', 'sunset-drive', 'vapor-blue'])
    for (const { name, colors } of palettes) expect(colors['--js-shadow'], name).toMatch(/^#[0-9a-f]{6}$/)
  })

  // 그림자가 놓이는 곳(바탕, 올라온 바탕)과 그림자를 드리우는 것(패널, 테두리)에서 모두 눈에 띄어야 한다.
  it.each(['neon-night', 'sunset-drive', 'vapor-blue'])('stands out from the background, the panels and the borders in %s', name => {
    const { colors } = palettes.find(p => p.name === name)
    const shadow = colors['--js-shadow']
    expect(contrast(shadow, colors['--js-bg'])).toBeGreaterThan(1.5)
    expect(contrast(shadow, colors['--js-bg-raised'])).toBeGreaterThan(1.45)
    expect(contrast(shadow, colors['--js-surface'])).toBeGreaterThan(1.35)
    expect(contrast(shadow, colors['--js-line'])).toBeGreaterThan(1.25)
    // 패널보다 밝고 테두리보다 어둡다: 그림자가 테두리보다 앞으로 나와 보이면 안 된다
    expect(luminance(shadow)).toBeGreaterThan(luminance(colors['--js-surface-2']))
    expect(luminance(shadow)).toBeLessThan(luminance(colors['--js-line']))
  })

  it('is what --js-drop uses', () => {
    expect(theme).toMatch(/--js-drop: 4px 4px 0 var\(--js-shadow\);/)
  })

  it('is not black anywhere in the styles', () => {
    const root = join(__dirname, '..')
    const styles = dir =>
      readdirSync(dir).flatMap(entry => {
        const path = join(dir, entry)
        return statSync(path).isDirectory() ? styles(path) : /\.(scss|vue)$/.test(entry) ? [path] : []
      })
    const black = /#000(000)?\b|\bblack\b|rgba?\(0[, ]+0[, ]+0\b/
    const found = styles(root).flatMap(path =>
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .filter(line => /box-shadow:|--js-drop:/.test(line) && black.test(line))
        .map(line => `${relative(root, path)}: ${line.trim()}`)
    )
    expect(found).toEqual([])
  })
})

// 설정, 정보, From SSH config 창은 b-overlay 가운데의 카드다 (role="dialog", popup/config-popup.test.js가 본다).
// 앱 창이 카드보다 낮으면 위아래가 잘리고 아무것도 스크롤되지 않아서 Save에 마우스로 닿을 수 없었다.
describe('a dialog card in a low window', () => {
  const start = theme.indexOf("\n.card[role='dialog'] {")
  const block = start < 0 ? '' : theme.slice(start, theme.indexOf('\n}\n', start))

  it('stays inside the window with a margin', () => {
    const margin = theme.match(/\n\$dialog-margin: (\d+)px;/)?.[1]

    expect(Number(margin)).toBeGreaterThanOrEqual(8)
    expect(block).toMatch(/\n {2}max-height: calc\(100vh - #\{2 \* \$dialog-margin\}\);/)
  })

  // 제목과 단추 줄은 늘 보이고, 넘치는 본문만 스크롤한다
  it('scrolls only its body', () => {
    expect(block).toMatch(/\n {2}> \.card-body \{\n {4}overflow-y: auto;\n {2}\}/)
    expect(block).not.toMatch(/\n {2}overflow/)
  })

  it('keeps the band on top at its height', () => {
    expect(block).toMatch(/\n {2}&::before \{\n {4}flex: none;\n {2}\}/)
  })
})
