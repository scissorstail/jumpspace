// 다이어그램 목록(제목 아래에 열리는 판)의 항목. 저장하는 값({ name, data, view? })에 화면 상태를 덧붙인 것이다.
import cloneDeep from 'lodash/cloneDeep'

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

// 항목의 사본. 다이어그램(data)과 캔버스 위치(view)를 깊이 복사해서, 사본을 고쳐도 원본이 바뀌지 않는다.
// 사본은 이름 입력창이 열린 상태로 시작한다.
export function copyNavigatorItem(item, index) {
  return createNavigatorItem(
    { name: item.name, data: cloneDeep(item.data), ...(item.view && { view: { ...item.view } }) },
    index,
    { isEditing: true }
  )
}

// removed에 든 항목을 뺀 목록. 열려 있던 항목(opened)도 빠지면 openedRemoved가 true이다. (에디터를 닫아야 한다)
export function removeNavigatorItems(items, removed, opened) {
  const gone = new Set(removed)
  return { items: items.filter(x => !gone.has(x)), openedRemoved: Boolean(opened) && gone.has(opened) }
}
