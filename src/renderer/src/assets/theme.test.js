import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
