// 오류를 화면에 토스트로 알린다. vm은 BootstrapVue가 설치된 Vue 컴포넌트 인스턴스이다.
export function toastError(vm, title, error) {
  vm.$bvToast.toast(String(error?.message || error), { title, variant: 'danger', solid: true })
}
