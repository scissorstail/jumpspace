// 캔버스의 위치(x, y)와 확대(k) 상태를 검사한다. main(projects.json을 읽을 때)과 renderer(복원할 때, 에디터의 확대 범위)가 함께 쓴다.

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 2

// 저장된 값이 쓸 수 있는 상태이면 { k, x, y }, 아니면 null
export function sanitizeView(view) {
  if (!view || typeof view !== 'object') return null

  const { k, x, y } = view
  if (![k, x, y].every(Number.isFinite) || k < MIN_ZOOM || k > MAX_ZOOM) return null

  return { k, x, y }
}
