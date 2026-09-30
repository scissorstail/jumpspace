// 캔버스의 위치(x, y)와 확대(k) 상태. item마다 마지막 상태를 기억해 두었다가 다시 열 때 복원한다.
export const DEFAULT_VIEW = { k: 0.85, x: 0, y: 0 }

// 에디터의 scaleExtent(editor/index.vue)와 같은 범위
const MIN_ZOOM = 0.1
const MAX_ZOOM = 2

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits

// 저장된 값이 쓸 수 있는 상태이면 { k, x, y }, 아니면 null
export function sanitizeView(view) {
  if (!view || typeof view !== 'object') return null

  const { k, x, y } = view
  if (![k, x, y].every(Number.isFinite) || k < MIN_ZOOM || k > MAX_ZOOM) return null

  return { k, x, y }
}

// Rete area의 transform에서 저장할 값을 만든다. (드래그 중 계속 바뀌므로 소수점은 줄인다)
export function viewOf(transform) {
  return { k: round(transform.k, 3), x: round(transform.x, 1), y: round(transform.y, 1) }
}
