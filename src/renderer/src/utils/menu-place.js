// 오른쪽 클릭 메뉴(캔버스와 노드)의 자리 (#267; owner, 2026-10-18: "보통 메뉴처럼"). 보통의 메뉴처럼 왼쪽 위 모서리를
// 포인터에 둔다. 오른쪽에 자리가 없으면 오른쪽 모서리를, 아래에 자리가 없으면 아래 모서리를 포인터에 둔다 (왼쪽으로, 위로 연다).
// 어느 쪽이든 포인터는 메뉴 밖, 모서리에서 MENU_GAP만큼 떨어진 곳이라서, 오른쪽 클릭 뒤 그 자리를 한 번 더 눌러도 항목이 눌리지
// 않는다 (전에는 노드 메뉴의 Delete가 포인터 아래에 열렸다). 양쪽 다 모자라면(영역이 메뉴보다 작으면) 영역 안으로 밀어 넣는다.
export const MENU_GAP = 2

// pointer는 [x, y], size는 메뉴의 [너비, 높이], room은 메뉴가 열릴 영역 { left, top, right, bottom }: 모두 창의 좌표 (px)
export function menuPlace([x, y], [width, height], room) {
  return [along(x, width, room.left, room.right), along(y, height, room.top, room.bottom)]
}

// 한 방향: 앞(오른쪽, 아래)에 들어가면 앞으로, 아니면 뒤로, 둘 다 아니면 영역의 끝에 맞춘다 (영역보다 크면 시작에)
function along(at, size, start, end) {
  if (at + MENU_GAP + size <= end) return at + MENU_GAP
  if (at - MENU_GAP - size >= start) return at - MENU_GAP - size
  return Math.max(start, end - size)
}
