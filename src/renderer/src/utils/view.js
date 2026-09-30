// 캔버스의 위치(x, y)와 확대(k) 상태. item마다 마지막 상태를 기억해 두었다가 다시 열 때 복원한다.
export const DEFAULT_VIEW = { k: 0.85, x: 0, y: 0 }

// 검사와 확대 범위는 main과 같이 쓴다.
export { MAX_ZOOM, MIN_ZOOM, sanitizeView } from '../../../shared/view.js'

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits

// Rete area의 transform에서 저장할 값을 만든다. (드래그 중 계속 바뀌므로 소수점은 줄인다)
export function viewOf(transform) {
  return { k: round(transform.k, 3), x: round(transform.x, 1), y: round(transform.y, 1) }
}
