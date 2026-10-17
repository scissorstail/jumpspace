// 다이어그램 목록(제목 아래에 열리는 판)의 항목. 저장하는 값({ name, data, view? })에 화면 상태를 덧붙인 것이다.
import cloneDeep from 'lodash/cloneDeep'

// 판 안의 메뉴(b-dropdown)에 넘기는 popper 옵션. 판과 목록은 넘치는 것을 자르므로(overflow),
// 메뉴를 position: fixed로 띄워야 판 밖으로 나온 부분이 잘리지 않는다. (boundary="window"와 함께 쓴다)
export const SWITCHER_MENU_POPPER = Object.freeze({ positionFixed: true })

// 목록의 한 줄을 만든다. index는 목록 안에서 겹치지 않는 번호이고(DOM id에 쓴다), isEditing이면 이름 입력창이 열린 상태이다.
// 연 차례(opened, 한 번도 열지 않았으면 0)는 처음부터 둔다: 처음 열 때 새로 붙이면 Vue가 그것을 목록이 바뀐 것으로 보고
// (main-navigator의 items watch) 한 번 더 저장했다.
export function createNavigatorItem(item, index, { isEditing = false } = {}) {
  return { ...item, opened: item.opened || 0, isMenuShown: false, isSelected: false, isEditing, index }
}

// 화면 상태를 떼어내고 저장/내보내기에 쓰는 { name, data, view?, opened? }로 되돌린다. (내보내는 파일에서는 main이 opened를 뺀다)
export function toProjectItems(items) {
  return items.map(x => ({ name: x.name, data: x.data, ...(x.view && { view: x.view }), ...(x.opened && { opened: x.opened }) }))
}

// 목록 위에 따로 보이는, 마지막에 연 다이어그램의 수 (owner, 2026-10-17: "최근에 고른 공간을 위에 따로 모아서", #255)
export const RECENT_SPACES = 3

// 마지막에 연 다이어그램들: 연 차례(opened)가 나중인 것부터 count개. 열려 있는 것(opened 인자)은 빼고 (이미 열려 있으니 고를
// 일이 없다), 한 번도 열지 않은 것은 들지 않는다. 같은 차례이면 목록의 순서대로. 목록에서의 자리는 그대로 남는다.
export function recentItems(items, openedItem, count = RECENT_SPACES) {
  return items.filter(x => x.opened > 0 && x !== openedItem).sort((a, b) => b.opened - a.opened).slice(0, count)
}

// 막 연 다이어그램에 줄 차례: 지금까지의 가장 나중 차례 다음
export function nextOpened(items) {
  return items.reduce((last, x) => Math.max(last, x.opened || 0), 0) + 1
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
