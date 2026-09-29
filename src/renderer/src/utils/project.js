// item 목록 중에 비밀번호가 저장된 node가 있는지 확인한다. (export 시 평문으로 파일에 들어가기 때문)
export function hasSavedPassword(items) {
  return items.some(item =>
    Object.values(item?.data?.nodes || {}).some(node => Boolean(node?.data?.connection?.password))
  )
}

export const EXPORT_PASSWORD_WARNING = 'Some nodes have a saved password. The exported file will contain it as plain text. Continue?'
