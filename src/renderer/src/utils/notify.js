// ipcRenderer.invoke()가 던지는 오류 메시지에는 "Error invoking remote method 'channel': Error: " 접두사가 붙는다.
// 사용자에게는 뒷부분만 보여준다.
export function errorMessage(error) {
  const message = String((typeof error === 'string' ? error : error?.message) || 'Unknown error')

  return message.replace(/^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/, '')
}

// 오류 문구의 줄바꿈(main의 "...\nCheck ... in Settings.")을 화면에서도 지킨다. (theme.scss의 .msg-pre-line)
const PRE_LINE = 'msg-pre-line'

// 오류를 화면에 토스트로 알린다. vm은 BootstrapVue가 설치된 Vue 컴포넌트 인스턴스이다.
export function toastError(vm, title, error) {
  vm.$bvToast.toast(errorMessage(error), { title, variant: 'danger', solid: true, bodyClass: PRE_LINE })
}

// 오류를 확인 창으로 알린다. 포커스는 OK 단추에 두어 Enter로 닫을 수 있다.
export function errorBox(vm, title, error) {
  return vm.$bvModal.msgBoxOk(errorMessage(error), { title, bodyClass: PRE_LINE, autoFocusButton: 'ok' })
}
