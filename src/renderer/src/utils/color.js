// 색을 같은 색상으로 덜 밝게, 덜 선명하게 만든다 (순수 함수). 터미널 색의 단계가 쓴다 (utils/terminal-view.js).
// OKLCH로 계산한다: 밝기(l, 0..1), 선명함(c), 색상(h, 라디안)이 따로라서 밝기나 선명함만 낮춰도 색상이 남는다.
// (식은 Björn Ottosson의 OKLab이다)

const toLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)

// '#rrggbb'만 읽는다 (색 묶음의 색은 모두 이 꼴이다). 아니면 null.
function parseHex(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return null

  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
}

const formatHex = rgb => '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')

// '#rrggbb' -> { l, c, h }. 읽을 수 없는 색이면 null.
export function toOklch(hex) {
  const rgb = parseHex(hex)
  if (!rgb) return null

  const [r, g, b] = rgb.map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  return { l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, c: Math.hypot(a, bb), h: Math.atan2(bb, a) }
}

// { l, c, h } -> 선형 sRGB [r, g, b]. 화면이 낼 수 없는 색이면 0..1을 벗어난다.
function toLinearRgb({ l, c, h }) {
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short
  ]
}

const isShown = rgb => rgb.every(v => v >= -0.0005 && v <= 1.0005)

// { l, c, h } -> '#rrggbb'. 화면이 낼 수 없는 색은 낼 수 있을 때까지 선명함만 낮춘다 (밝기와 색상은 그대로).
export function fromOklch(color) {
  let next = { ...color }
  while (!isShown(toLinearRgb(next)) && next.c > 0) next = { ...next, c: Math.max(0, next.c - 0.002) }

  return formatHex(toLinearRgb(next).map(toGamma))
}

// 같은 색상으로, 밝기는 maxLightness, 선명함은 maxChroma를 넘지 않게 한 색.
// 이미 그 안에 있는 색과 읽을 수 없는 색은 그대로 돌려준다.
export function tone(hex, maxLightness, maxChroma) {
  const color = toOklch(hex)
  if (!color || (color.l <= maxLightness && color.c <= maxChroma)) return hex

  return fromOklch({ l: Math.min(color.l, maxLightness), c: Math.min(color.c, maxChroma), h: color.h })
}
