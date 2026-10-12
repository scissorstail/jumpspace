// 창의 크기와 자리를 기억한다 (electron-store의 key 'window'). 설정(key 'setting')과 따로 둔다:
// 설정은 화면이 통째로 읽고 써서, 거기에 두면 화면이 가진 옛 값으로 덮인다.

export const DEFAULT_SIZE = { width: 1024, height: 768 }
// 이보다 작게 저장된 것은 믿지 않는다
export const MIN_SIZE = { width: 400, height: 300 }
// 창을 다시 잡아 옮길 수 있으려면 제목 줄이 화면 안에 이만큼은 있어야 한다
const REACH = { width: 100, height: 32 }
// 화면 가장자리에 붙인 창은 보이지 않는 테두리만큼 화면 밖에 있다 (Windows)
const EDGE = 10

// 창을 옮기거나 크기를 바꾼 뒤 이만큼 지나면 저장한다 (끄는 동안에는 이벤트가 픽셀마다 온다)
export const BOUNDS_SAVE_DELAY_MS = 500

const fresh = () => ({ ...DEFAULT_SIZE, isMaximized: false })

// 화면 배율(scaleFactor)에서 물리 픽셀로 딱 떨어지는 가장 작은 걸음: 100 %는 1, 150 %는 2, 125 %와 175 %는 4.
// 창의 크기와 자리는 이 걸음에 맞춘다. Electron은 물리 픽셀과 오갈 때마다 바깥쪽으로 올림을 해서, 맞지 않는 값으로
// 연 창은 열 때마다 몇 px씩 커진다 (125 %에서 잼, 2026-10-12: 900 x 640으로 다섯 번 열면 931 x 671).
export function pixelStep(scaleFactor) {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return 1
  for (let step = 1; step <= 20; step++) {
    if (Math.abs(step * scaleFactor - Math.round(step * scaleFactor)) < 1e-6) return step
  }
  return 1
}

// 저장된 값(saved)으로 새 창의 크기와 자리를 정한다. workAreas는 지금 있는 화면들의 쓸 수 있는 영역({ x, y, width, height })이고,
// 그 화면의 배율(scaleFactor)이 같이 오면 값을 그 배율의 걸음(pixelStep)에 맞춘다: 가까운 쪽으로, 크기는 화면보다 크지 않게.
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

  const step = pixelStep(area.scaleFactor ?? 1)
  const near = value => Math.round(value / step) * step
  const within = (value, limit) => Math.min(near(value), Math.floor(limit / step) * step)

  return {
    x: near(x),
    y: near(y),
    width: within(width, area.width),
    height: within(height, area.height),
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

// 창(target: BrowserWindow)의 크기와 자리를 windows(createWindowStore)에 저장하는 일.
// soon: 옮기거나 크기를 바꿀 때마다 부른다, 멈춘 뒤에 한 번 저장한다. now: 닫을 때, 바로. stop: 창이 닫힌 뒤, 기다리던 저장을 버린다.
// 최소화한 동안에는 저장하지 않는다 (그때는 최대화했었는지 알 수 없다). 최대화한 창의 getBounds()는 화면 전체라서
// 돌아갈 크기는 getNormalBounds()에서 읽는다. 저장하지 못해도 예외를 내지 않는다: 창은 닫혀야 한다.
export function createBoundsSaver(target, windows, delay = BOUNDS_SAVE_DELAY_MS) {
  let timer = null
  const now = () => {
    clearTimeout(timer)
    try {
      if (target.isDestroyed() || target.isMinimized()) return
      windows.set(target.getNormalBounds(), target.isMaximized())
    } catch (e) {
      console.error('The window bounds could not be saved', e)
    }
  }
  const soon = () => {
    clearTimeout(timer)
    timer = setTimeout(now, delay)
  }

  return { now, soon, stop: () => clearTimeout(timer) }
}
