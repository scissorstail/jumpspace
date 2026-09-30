// Esc 키를 누르면 handler를 부른다. 다시 부르면 리스너를 떼는 함수를 돌려준다.
export function onEscape(handler) {
  const listener = event => {
    if (event.key === 'Escape') {
      handler(event)
    }
  }
  document.addEventListener('keydown', listener)

  return () => document.removeEventListener('keydown', listener)
}

// `show` prop과 `update:show` 이벤트를 쓰는 팝업이 열려 있는 동안 Esc로 닫히게 한다.
export const dismissOnEscape = {
  watch: {
    show(shown) {
      this.stopListeningEscape?.()
      this.stopListeningEscape = shown ? onEscape(() => this.$emit('update:show', false)) : null
    }
  },
  beforeDestroy() {
    this.stopListeningEscape?.()
  }
}
