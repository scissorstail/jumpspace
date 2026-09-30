// ipcRenderer.invoke()가 던지는 오류 메시지에는 "Error invoking remote method 'channel': Error: " 접두사가 붙는다.
// 사용자에게는 뒷부분만 보여준다.
export function errorMessage(error) {
  const message = String((typeof error === 'string' ? error : error?.message) || 'Unknown error')

  return message.replace(/^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/, '')
}

// 오류를 화면에 토스트로 알린다. vm은 BootstrapVue가 설치된 Vue 컴포넌트 인스턴스이다.
export function toastError(vm, title, error) {
  vm.$bvToast.toast(errorMessage(error), { title, variant: 'danger', solid: true })
}
