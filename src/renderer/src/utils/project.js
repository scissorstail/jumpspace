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

export const EXPORT_PASSWORD_WARNING = 'Some nodes have a saved password. The exported file will contain it as plain text. Continue?'
