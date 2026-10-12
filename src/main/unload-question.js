import { UNSAVED_TEXT, UNSAVED_TITLE } from '../shared/unsaved.js'

// 잠금을 푼 채로 창을 닫거나(닫기 단추, 트레이의 Quit) 새로 고치려 할 때 묻는 창.
// 화면이 beforeunload에서 막으면 Electron이 main에 will-prevent-unload를 보내고, main이 거기서 묻는다.
// 취소가 기본이다: Enter나 Esc로는 아무것도 잃지 않는다.
export const UNLOAD_QUESTION = {
  type: 'warning',
  title: UNSAVED_TITLE,
  message: UNSAVED_TEXT,
  buttons: ['Discard changes', 'Cancel'],
  defaultId: 1,
  cancelId: 1,
  noLink: true
}

// ask(options)는 고른 단추의 번호를 돌려준다 (dialog.showMessageBoxSync). 버리고 떠나도 되면 true.
// 물을 수 없으면(예외) 떠나게 둔다: 닫을 수 없는 창보다는 낫다.
export function mayUnload(ask) {
  try {
    return ask(UNLOAD_QUESTION) === 0
  } catch (e) {
    console.error('The question before closing could not be asked', e)
    return true
  }
}
