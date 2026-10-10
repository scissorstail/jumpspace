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

// 그림자는 흐리지 않은 단색 판이다. 검정이던 때에는 어두운 바탕과 구별되지 않아서 그림자도, 그 위 패널의 모서리도 보이지 않았다.
describe('the color of the hard shadows', () => {
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
