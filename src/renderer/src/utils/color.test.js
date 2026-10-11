import { describe, expect, it } from 'vitest'
import { fromOklch, toOklch, tone } from './color'

const degrees = radians => ((radians * 180) / Math.PI + 360) % 360

describe('toOklch', () => {
  it('reads black, white and gray as colors without chroma', () => {
    expect(toOklch('#000000').l).toBeCloseTo(0, 6)
    expect(toOklch('#ffffff').l).toBeCloseTo(1, 4)
    expect(toOklch('#ffffff').c).toBeCloseTo(0, 4)
    expect(toOklch('#808080').c).toBeCloseTo(0, 4)
    expect(toOklch('#808080').l).toBeCloseTo(0.6, 2)
  })

  // 알려진 값 (OKLCH: 밝기, 선명함, 색상 각도)
  it('reads the primaries', () => {
    const known = { '#ff0000': [0.628, 0.2577, 29.23], '#00ff00': [0.8664, 0.2948, 142.5], '#0000ff': [0.452, 0.3132, 264.05] }

    for (const [hex, [l, c, h]] of Object.entries(known)) {
      const color = toOklch(hex)
      expect(color.l, hex).toBeCloseTo(l, 3)
      expect(color.c, hex).toBeCloseTo(c, 3)
      expect(degrees(color.h), hex).toBeCloseTo(h, 1)
    }
  })

  it('reads upper and lower case and nothing but #rrggbb', () => {
    expect(toOklch('#FFD319')).toEqual(toOklch('#ffd319'))
    for (const odd of ['#fff', 'ffd319', '#ffd31', '#ffd3199', 'rgb(1, 2, 3)', 'var(--js-live)', '', null, undefined, 7]) {
      expect(toOklch(odd), String(odd)).toBeNull()
    }
  })
})

describe('fromOklch', () => {
  it('comes back to the color it was read from', () => {
    for (const hex of ['#3dff8a', '#ffd319', '#ff2e97', '#00e5ff', '#5aa9ff', '#0d0221', '#ffffff', '#000000', '#c9bdf5']) {
      expect(fromOklch(toOklch(hex)), hex).toBe(hex)
    }
  })

  // 화면이 낼 수 없는 색: 밝기와 색상은 두고 선명함만 낮춘다
  it('lowers only the chroma of a color the screen cannot show', () => {
    const wanted = { l: 0.7, c: 0.4, h: 2.5 }
    const shown = toOklch(fromOklch(wanted))

    expect(shown.c).toBeLessThan(0.3)
    expect(shown.c).toBeGreaterThan(0.1)
    expect(shown.l).toBeCloseTo(wanted.l, 2)
    expect(shown.h).toBeCloseTo(wanted.h, 1)
  })

  it('does not change what it was given', () => {
    const color = { l: 0.7, c: 0.4, h: 2.5 }
    fromOklch(color)
    expect(color).toEqual({ l: 0.7, c: 0.4, h: 2.5 })
  })
})

describe('tone', () => {
  it('leaves a color that is inside the limits exactly as it is', () => {
    expect(tone('#5aa9ff', 0.76, 0.15)).toBe('#5aa9ff')
    expect(tone('#5AA9FF', 0.76, 0.15)).toBe('#5AA9FF')
    expect(tone('#0d0221', 0.76, 0.15)).toBe('#0d0221')
  })

  it('lowers the lightness and the chroma to the limits and keeps the hue', () => {
    for (const hex of ['#3dff8a', '#ffd319', '#00e5ff', '#ff2e97', '#f96cff', '#6ff7e8']) {
      const before = toOklch(hex)
      const after = toOklch(tone(hex, 0.7, 0.12))

      // 8비트로 맞추느라 조금 어긋난다
      expect(after.l, hex).toBeLessThanOrEqual(0.7 + 0.004)
      expect(after.c, hex).toBeLessThanOrEqual(0.12 + 0.004)
      expect(after.l, hex).toBeCloseTo(Math.min(before.l, 0.7), 2)
      expect(after.c, hex).toBeCloseTo(Math.min(before.c, 0.12), 2)
      expect(Math.abs(degrees(after.h) - degrees(before.h)), hex).toBeLessThan(2)
    }
  })

  it('lowers only what is above its limit', () => {
    // 밝기만 넘는 색, 선명함만 넘는 색
    const light = toOklch(tone('#c9bdf5', 0.7, 0.2))
    expect(light.l).toBeCloseTo(0.7, 2)
    expect(light.c).toBeCloseTo(toOklch('#c9bdf5').c, 2)

    const strong = toOklch(tone('#ff2e97', 0.9, 0.12))
    expect(strong.l).toBeCloseTo(toOklch('#ff2e97').l, 2)
    expect(strong.c).toBeCloseTo(0.12, 2)
  })

  it('gives back what it cannot read', () => {
    for (const odd of ['rgb(1, 2, 3)', 'var(--js-live)', '', '#fff', null, undefined]) {
      expect(tone(odd, 0.5, 0.1)).toBe(odd)
    }
  })

  // owner가 그림에서 고른 색들 (2026-10-11, Sunset Drive): 조금 낮춘 것과 많이 낮춘 것
  it('gives the colors of the sheet the levels were chosen from', () => {
    const soft = { '#ff4d6d': '#e56c7a', '#3dff8a': '#5dcc7f', '#ffd319': '#d2ae1c', '#5aa9ff': '#5aa9ff', '#d86bff': '#c783e1', '#4ff0ff': '#01c8d7' }
    const muted = { '#ff4d6d': '#d37a82', '#3dff8a': '#61ac75', '#5aa9ff': '#649cda', '#d86bff': '#b383c6', '#4ff0ff': '#21acb7' }

    for (const [hex, wanted] of Object.entries(soft)) expect(tone(hex, 0.76, 0.15), hex).toBe(wanted)
    for (const [hex, wanted] of Object.entries(muted)) expect(tone(hex, 0.68, 0.11), hex).toBe(wanted)
    // 노랑은 많이 낮출 때도 밝기를 덜 낮춘다 (어두운 노랑은 올리브색이다)
    expect(tone('#ffd319', 0.76, 0.13)).toBe('#cdaf42')
  })
})
