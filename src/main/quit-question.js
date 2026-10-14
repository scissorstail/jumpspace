// 트레이의 Quit을 고를 때 돌고 있는 터미널이 있으면 먼저 묻는 창 (owner, #218).
// 끝내면 그 터미널은 모두 끝난다: 접속도, 그 안의 tmux 같은 것도. 창을 트레이로 숨길 때는 묻지 않는다: 숨긴 창의
// 터미널은 그대로 돈다 (owner: 트레이로 갈 때는 유지). 취소가 기본이다: Enter나 Esc로는 아무것도 끝나지 않는다.
export function quitQuestion(count) {
  return {
    type: 'question',
    title: 'Quit jumpspace',
    message: count === 1 ? '1 terminal is still running.' : `${count} terminals are still running.`,
    detail: 'Quitting closes them and ends their connections.',
    buttons: ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  }
}

// count는 돌고 있는 터미널의 수, ask(options)는 고른 단추의 번호를 돌려준다 (Promise여도 된다). 끝내도 되면 true.
// 터미널이 없으면 묻지 않는다. 물을 수 없으면(예외) 끝내게 둔다: 끝낼 수 없는 앱보다는 낫다.
export async function mayQuit(count, ask) {
  if (!(count > 0)) return true
  try {
    return (await ask(quitQuestion(count))) === 0
  } catch (e) {
    console.error('The question before quitting could not be asked', e)
    return true
  }
}
