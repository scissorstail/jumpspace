// item 목록 중에 비밀번호가 저장된 node가 있는지 확인한다. (export 시 평문으로 파일에 들어가기 때문)
export function hasSavedPassword(items) {
  return items.some(item =>
    Object.values(item?.data?.nodes || {}).some(node => Boolean(node?.data?.connection?.password))
  )
}

// 사이드바 검색: 대소문자와 앞뒤 공백은 무시하고, 이름에 검색어가 들어 있으면 일치한다. 검색어가 비어 있으면 모두 일치한다.
export function matchesKeyword(name, keyword) {
  const needle = String(keyword ?? '').trim().toLowerCase()

  return needle === '' || String(name ?? '').toLowerCase().includes(needle)
}

// 사이드바 목록에 보이는 항목이 하나도 없을 때 보여줄 글. 보이는 항목이 있으면 null.
// (이름을 바꾸는 중인 항목은 검색과 상관없이 보인다)
export function listEmptyText(items, keyword) {
  const list = items || []
  if (list.some(x => x.isEditing || matchesKeyword(x.name, keyword))) return null
  if (list.length === 0) return 'No items yet. Add one with +.'
  return `No item matches "${String(keyword).trim()}".`
}

export const EXPORT_PASSWORD_WARNING = 'Some nodes have a saved password. The exported file will contain it as plain text. Continue?'

// 저장된 항목 목록을 읽는다. load()는 저장 파일의 JSON 문자열(없으면 null), save(json)는 저장이다.
// 이전 버전은 localStorage(legacy)에 저장했다. 저장 파일이 아직 없으면 최초 1회 옮겨온다.
// 읽기나 해석에 실패하면 failed가 true다. 그 상태에서 저장하면 기존 데이터를 빈 목록으로 덮어쓰므로 저장을 막아야 한다.
export async function loadProjectData({ load, save, legacy }) {
  try {
    let json = await load()
    if (json === null && legacy) {
      await save(legacy)
      json = legacy
    }
    return { items: JSON.parse(json || '[]'), failed: false }
  } catch (error) {
    return { items: [], failed: true, error }
  }
}
