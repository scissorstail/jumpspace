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

// 캔버스 영역의 크기가 from에서 to로 바뀔 때({ width, height }) 다이어그램이 영역에서 같은 자리와 같은 비율을 차지하게 하는 보기.
// 배경 풍경이 영역에 맞춰 커지고 줄어드는 것과 같이 움직인다: 영역의 가운데에 있던 점은 가운데에 남고,
// 확대는 가로와 세로 중 더 많이 줄어든(덜 늘어난) 쪽의 비율을 따라서 보이던 것이 영역 밖으로 나가지 않는다.
// 크기를 알 수 없으면(0, 숨겨진 영역) 그대로 돌려준다.
export function scaleView(view, from, to) {
  const { k, x, y } = view
  if (![from?.width, from?.height, to?.width, to?.height].every(n => Number.isFinite(n) && n > 0)) return { k, x, y }

  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k * Math.min(to.width / from.width, to.height / from.height)))
  const scale = zoom / k

  return {
    k: zoom,
    x: to.width / 2 - (from.width / 2 - x) * scale,
    y: to.height / 2 - (from.height / 2 - y) * scale
  }
}

// 확대를 k로 바꾸되, 화면의 한 점(point: 캔버스 영역 기준 px)은 제자리에 둔 보기. (더블클릭한 곳을 기준으로 줌을 되돌릴 때)
export function zoomAround(view, k, point) {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))
  const scale = zoom / view.k

  return {
    k: zoom,
    x: point.x - (point.x - view.x) * scale,
    y: point.y - (point.y - view.y) * scale
  }
}
