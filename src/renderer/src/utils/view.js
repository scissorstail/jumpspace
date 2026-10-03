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
