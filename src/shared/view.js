// 캔버스의 위치(x, y)와 확대(k) 상태를 검사한다. main(projects.json을 읽을 때)과 renderer(복원할 때, 에디터의 확대 범위)가 함께 쓴다.

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 2

const isLength = value => Number.isFinite(value) && value > 0 && value <= MAX_AREA

// 캔버스 영역의 한 변으로 받아들이는 가장 큰 값(px). 저장 파일의 엉뚱한 값을 거른다.
export const MAX_AREA = 100000

// 저장된 값이 쓸 수 있는 상태이면 { k, x, y }, 아니면 null.
// w, h는 그 보기를 볼 때의 캔버스 영역 크기(px)다. 다른 크기의 창에서 열 때 같은 비율로 맞추는 데 쓴다 (renderer의 scaleView).
// 둘 다 쓸 수 있을 때만 남긴다. (예전 파일에는 없다)
export function sanitizeView(view) {
  if (!view || typeof view !== 'object') return null

  const { k, x, y, w, h } = view
  if (![k, x, y].every(Number.isFinite) || k < MIN_ZOOM || k > MAX_ZOOM) return null

  return isLength(w) && isLength(h) ? { k, x, y, w, h } : { k, x, y }
}
