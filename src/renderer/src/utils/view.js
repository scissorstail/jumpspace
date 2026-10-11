// 캔버스의 위치(x, y)와 확대(k) 상태. item마다 마지막 상태를 기억해 두었다가 다시 열 때 복원한다.
export const DEFAULT_VIEW = { k: 0.85, x: 0, y: 0 }

// 검사와 확대 범위는 main과 같이 쓴다.
import { MAX_ZOOM, MIN_ZOOM } from '../../../shared/view.js'
export { MAX_ZOOM, MIN_ZOOM, sanitizeView } from '../../../shared/view.js'

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits

// Rete area의 transform에서 저장할 값을 만든다. (드래그 중 계속 바뀌므로 소수점은 줄인다)
export function viewOf(transform) {
  return { k: round(transform.k, 3), x: round(transform.x, 1), y: round(transform.y, 1) }
}

// 상자(캔버스 좌표 { left, top, right, bottom })를 화면 영역(viewport: { left, top, width, height })의 가운데에 두는 보기.
// 확대는 지금 값(k)을 넘지 않고, 상자가 영역의 90%보다 크면 그만큼 줄인다.
export function fitView(viewport, box, k) {
  const width = Math.max(1, box.right - box.left)
  const height = Math.max(1, box.bottom - box.top)
  const fit = Math.min(k, (viewport.width * 0.9) / width, (viewport.height * 0.9) / height)
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit))

  return {
    k: zoom,
    x: viewport.left + viewport.width / 2 - ((box.left + box.right) / 2) * zoom,
    y: viewport.top + viewport.height / 2 - ((box.top + box.bottom) / 2) * zoom
  }
}

// 영역의 크기({ width, height })를 아는지. 접히거나 숨겨진 영역은 너비나 높이가 0이라서 모르는 것으로 친다.
export function isRealSize(size) {
  return [size?.width, size?.height].every(n => Number.isFinite(n) && n > 0)
}

// 캔버스 영역의 크기가 from에서 to로 바뀔 때({ width, height }) 다이어그램이 배경 풍경처럼 커지고 줄어들게 하는 보기.
// 확대는 영역의 높이를 따른다 (풍경의 지평선과 해도 높이를 따른다). 영역의 가운데에 있던 점은 가운데에 남는다.
// 터미널 패널은 높이만 바꾸므로, 패널을 열면 그만큼 줄고 닫으면 줄었던 바로 그 비율로 다시 커진다:
// from과 to를 바꾸면 정확히 반대가 되어서, 어느 크기에서 보기를 정했든 다른 크기에서의 보기가 서로 맞는다.
// (처음에는 가로와 세로 중 더 많이 줄어든 쪽의 비율을 따랐다. 그 규칙은 높이만 커질 때 확대하지 않아서,
// 패널을 연 채 확대를 바꾸고 닫으면 다이어그램이 작은 채로 남았다: owner, 2026-10-11)
// 너비만 바뀌면 크기는 그대로다. 크기를 알 수 없으면(0, 숨겨진 영역) 그대로 돌려준다.
export function scaleView(view, from, to) {
  const { k, x, y } = view
  if (!isRealSize(from) || !isRealSize(to)) return { k, x, y }

  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k * (to.height / from.height)))
  const scale = zoom / k

  return {
    k: zoom,
    x: to.width / 2 - (from.width / 2 - x) * scale,
    y: to.height / 2 - (from.height / 2 - y) * scale
  }
}

// 기억해 둔 보기(base: { view, size })를 지금의 캔버스 영역(area)에 맞춘 보기.
// size는 그 보기를 정할 때의 영역 크기다. 크기 없이 기억된 보기(처음 여는 다이어그램, Reset view로 돌린 처음 보기,
// 예전 파일, 영역이 접혀 있을 때 정한 것)는 터미널 패널이 자리를 차지하지 않을 때의 캔버스(full)에서의 보기로 친다:
// 패널이 없으면 그대로이고, 패널이 열려 있으면 다른 보기처럼 줄어든다. 그 캔버스가 어떤 크기든 그렇다: 사용자가 정한
// 보기는 창 높이를 따라 커지고 줄지만, 처음 보기는 어느 창에서나 처음 보기다.
export function shownView(base, area, full) {
  return scaleView(base.view, isRealSize(base.size) ? base.size : full, area)
}

// 캔버스 영역(area) 안에서, 터미널 패널이 없을 때의 캔버스(full)가 그 높이로 줄어들면 차지하는 부분
// ({ left, top, width, height }, 영역 안의 자리). 패널이 열려 있는 영역은 낮고 넓다. 그 너비를 다 쓰도록 맞춘 것은
// 패널을 닫아 다이어그램이 높이만큼 다시 커질 때 양옆이 잘리지만, 이 부분에 맞춘 것은 닫은 뒤에도 다 보인다.
// 패널이 없거나 크기를 모르면 영역 전체다.
export function fullCanvasIn(area, full) {
  const { width = 0, height = 0 } = area || {}
  if (!isRealSize(area) || !isRealSize(full)) return { left: 0, top: 0, width, height }

  const part = Math.min(width, full.width * height / full.height)

  return { left: (width - part) / 2, top: 0, width: part, height }
}
