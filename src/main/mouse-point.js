// 화면이 부탁하는 가짜 mouseMove의 자리 (드래그가 끝난 뒤 hover를 다시 맞추려고 보낸다: window:mouseMove).
// 자리로 쓸 수 있는 수 둘만 받는다. 창 밖의 자리도 받는다: 창 밖에서 놓은 드래그는 그 자리의 mouseMove로 hover가 풀린다
// (화면은 mousemove 없이 mouseleave를 받는다). 유한한 수이기만 하면 넘겼을 때는, 터무니없이 큰 값(3e38, 1e308)을 넘긴 뒤로
// 화면이 마우스의 움직임을 더는 받지 못했다. 2 ** 53까지는 아무 일도 없었다 (2026-10-14, 실제 창에서 쟀다).
// 화면의 자리는 32비트 정수를 넘지 않는다.
const LIMIT = 2 ** 31 - 1

//   data: 화면이 보낸 것 ({ x, y }여야 한다)
export function mousePoint(data) {
  // NaN과 Infinity는 이 비교에서 떨어진다
  const usable = value => typeof value === 'number' && Math.abs(value) <= LIMIT
  const { x, y } = data ?? {}

  return usable(x) && usable(y) ? { x, y } : null
}
