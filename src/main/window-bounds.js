// 창의 크기와 자리를 기억한다 (electron-store의 key 'window'). 설정(key 'setting')과 따로 둔다:
// 설정은 화면이 통째로 읽고 써서, 거기에 두면 화면이 가진 옛 값으로 덮인다.

export const DEFAULT_SIZE = { width: 1024, height: 768 }
// 이보다 작게 저장된 것은 믿지 않는다
export const MIN_SIZE = { width: 400, height: 300 }
// 창을 다시 잡아 옮길 수 있으려면 제목 줄이 화면 안에 이만큼은 있어야 한다
const REACH = { width: 100, height: 32 }
// 화면 가장자리에 붙인 창은 보이지 않는 테두리만큼 화면 밖에 있다 (Windows)
const EDGE = 10

const fresh = () => ({ ...DEFAULT_SIZE, isMaximized: false })

// 저장된 값(saved)으로 새 창의 크기와 자리를 정한다. workAreas는 지금 있는 화면들의 쓸 수 있는 영역({ x, y, width, height })이다.
// 쓸 수 없는 값이면 기본 크기만 돌려준다 (자리가 없으면 Electron이 가운데에 둔다): 처음 실행, 깨진 값, 너무 작은 창,
// 제목 줄이 어느 화면에도 없는 창 (그 모니터를 뺐다). 화면보다 큰 창은 그 화면의 크기로 줄인다.
export function restoreBounds(saved, workAreas = []) {
  const { x, y, width, height } = saved || {}
  if (![x, y, width, height].every(Number.isFinite) || width < MIN_SIZE.width || height < MIN_SIZE.height) return fresh()

  const area = workAreas.find(a =>
    y >= a.y - EDGE && y + REACH.height <= a.y + a.height &&
    Math.min(x + width, a.x + a.width) - Math.max(x, a.x) >= REACH.width
  )
  if (!area) return fresh()

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.min(width, area.width)),
    height: Math.round(Math.min(height, area.height)),
    isMaximized: saved.isMaximized === true
  }
}

// store는 get/set이 있는 electron-store다. 읽은 값은 restoreBounds가 가려 쓴다.
export function createWindowStore(store) {
  return {
    get() {
      try {
        return store.get('window') ?? null
      } catch {
        return null
      }
    },
    // bounds는 최대화하지 않았을 때의 크기와 자리다 (win.getNormalBounds()).
    set(bounds, isMaximized) {
      const { x, y, width, height } = bounds
      store.set('window', { x, y, width, height, isMaximized: Boolean(isMaximized) })
    }
  }
}
