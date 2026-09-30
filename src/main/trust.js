// 앱 화면의 주소인지 확인한다. IPC 요청을 받을지(isTrusted), 창이 이동해도 되는지(will-navigate)에 쓴다.
// 문자열 앞부분만 비교하면 'app://.evil/…'이나 dev server 'http://localhost:5173'에 대한 'http://localhost:51730'도 통과하므로
// 주소를 해석해서 scheme과 host(origin)를 비교한다.
//   앱: app://./… (기존 버전과 같은 origin을 유지한다)
//   개발: electron-vite dev server (ELECTRON_RENDERER_URL)의 origin

export const APP_URL = 'app://./index.html'

function parse(url) {
  try {
    return new URL(String(url ?? ''))
  } catch {
    return null
  }
}

export function isAppUrl(url, devUrl = '') {
  const u = parse(url)
  if (!u) return false
  if (u.protocol === 'app:' && u.host === '.') return true

  const dev = devUrl ? parse(devUrl) : null
  return Boolean(dev) && dev.origin !== 'null' && u.origin === dev.origin
}
