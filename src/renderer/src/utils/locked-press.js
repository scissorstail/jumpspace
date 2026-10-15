// 잠긴 다이어그램에서 노드 위를 눌렀을 때 그 누름이 누구의 것인지.
//
// 잠겨 있으면 노드는 옮길 수도 고를 수도 없다. 그런데 Rete는 노드 위의 누름을 노드의 것으로 삼고 멈추므로(끌기는 잠금
// 플러그인이 막는다) 노드 위에서 시작한 끌기는 아무 일도 하지 않았다. 그래서 잠긴 동안 노드의 그림, 이름, 접속 정보,
// 소켓은 배경처럼 군다: 그 위에서 끌면 캔버스가 움직인다. 단추(접속, 포워딩, 설정)와 팝오버 안은 그대로 둔다.
// 마우스를 올리면 단추가 떠야 하므로 pointer-events를 끄지 않고, 누름만 캔버스로 넘긴다. 그 밖의 반응(올렸을 때의 색, 손 모양 커서,
// 글자의 툴팁)은 잠긴 동안 없다 (owner, 2026-10-15: 단추 말고는 마우스에 반응하지 않는다; canvas.scss, component.vue).

// 누름을 그대로 받는 것들. .menu-item은 노드 위에 뜨는 단추 하나의 자리(단추와 그 배지)다.
export const PRESS_KEEPERS = 'button, a, input, select, textarea, label, .menu-item, .vt-popover'

// 'canvas': 캔버스 끌기로 넘긴다. null: 그대로 둔다 (잠겨 있지 않다, 노드 밖이다, 단추다, 왼쪽 단추가 아니다).
//   event: pointerdown ({ target, button, pointerType })
export function lockedPress(event, { isLocked = false } = {}) {
  if (!isLocked) return null
  // 오른쪽 클릭은 지금처럼 메뉴 쪽으로 간다 (잠겨 있다는 안내가 뜬다).
  if (event?.pointerType === 'mouse' && event.button !== 0) return null

  const target = event?.target
  if (typeof target?.closest !== 'function' || !target.closest('.node')) return null

  return target.closest(PRESS_KEEPERS) ? null : 'canvas'
}

// 더블클릭이 캔버스의 것인지: 그러면 보기를 처음으로 돌린다 (머리글의 Reset view와 같은 일).
// 빈 캔버스 위는 언제나 그렇다. 노드 위는 잠긴 동안에만 그렇다: 그때 노드의 그림과 글자는 배경처럼 군다 (위의 lockedPress와 같은 규칙,
// 단추와 입력칸은 뺀다). 편집 중의 노드, 연결선, 우클릭 메뉴 위의 더블클릭은 그대로 둔다 (글자를 고르는 것 등).
//   event: dblclick ({ target })
export function isCanvasDoubleClick(event, { isLocked = false } = {}) {
  const target = event?.target
  if (typeof target?.closest !== 'function') return false
  if (target.closest('.connection, .context-menu')) return false
  if (!target.closest('.node')) return true

  return lockedPress(event, { isLocked }) === 'canvas'
}
