// 사이드바 목록의 항목. 저장하는 값({ name, data, view? })에 화면 상태를 덧붙인 것이다.

// 목록의 한 줄을 만든다. index는 목록 안에서 겹치지 않는 번호이고(DOM id에 쓴다), isEditing이면 이름 입력창이 열린 상태이다.
export function createNavigatorItem(item, index, { isEditing = false } = {}) {
  return { ...item, isMenuShown: false, isSelected: false, isEditing, index }
}

// 화면 상태를 떼어내고 저장/내보내기에 쓰는 { name, data, view? }로 되돌린다.
export function toProjectItems(items) {
  return items.map(x => ({ name: x.name, data: x.data, ...(x.view && { view: x.view }) }))
}

// 새 항목에 담는 빈 다이어그램
export function emptyItemData() {
  return { id: 'test@0.1.0', nodes: {} }
}
