// 화면이 안내할 수 있게, 실패해도 예외 대신 { ok: false, error }를 돌려준다.
// 성공하면 { ok: true }에 fn이 돌려준 객체의 값을 더한다. label은 실패를 로그에 남길 때 쓴다.
export async function toResult(label, fn) {
  try {
    return { ...(await fn()), ok: true }
  } catch (e) {
    console.error(`${label} failed:`, e)
    return { ok: false, error: e?.message ?? String(e) }
  }
}
