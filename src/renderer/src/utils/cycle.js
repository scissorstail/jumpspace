// 목록에서 current의 다음(step = 1) 또는 이전(step = -1) 항목을 돌려준다. 끝에서는 반대쪽 끝으로 이어진다.
// current가 목록에 없으면 첫 항목이고, 목록이 비어 있으면 null이다.
export function cycle(list, current, step = 1) {
  if (!Array.isArray(list) || list.length === 0) return null

  const index = list.indexOf(current)
  if (index === -1) return list[0]

  return list[(index + step + list.length) % list.length]
}
