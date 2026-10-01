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

// 키보드(Enter/Space)로 누른 버튼의 click 이벤트는 detail이 0이고, 마우스는 1 이상이다.
export const isKeyboardClick = event => event.detail === 0

// 요소에 포커스를 주되, 아직 보이지 않아서(visibility: hidden) 포커스가 들어가지 않았으면 다음 프레임에 다시 시도한다.
// v-popover는 열린 뒤 위치를 잡는 동안 한두 프레임 숨겨져 있어서, 그때 부른 focus()는 아무 일도 하지 않았다.
export function focusWhenShown(getElement, { schedule = nextFrame, tries = 20 } = {}) {
  const attempt = left => {
    const element = getElement()
    if (!element) return
    element.focus()
    if (element.ownerDocument?.activeElement !== element && left > 1) {
      schedule(() => attempt(left - 1))
    }
  }
  attempt(tries)
}

function nextFrame(callback) {
  return typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(callback, 16)
}

// v-popover(ref="popover")가 열려 있는 동안 Esc로 닫고, 포커스를 열었던 버튼으로 돌려준다.
// 팝오버를 키보드로 열면 포커스를 팝오버로 옮겨서 Tab이 그 안으로 이어지게 한다.
// 트리거 버튼의 click에 onTriggerClick을, 팝오버의 show/hide 이벤트에 onPopoverShow / onPopoverHide를 연결해서 쓴다.
export const closePopoverOnEscape = {
  created() {
    this.isOpenedByKeyboard = false
  },
  methods: {
    onTriggerClick(event) {
      this.isOpenedByKeyboard = isKeyboardClick(event)
    },
    onPopoverShow() {
      if (this.isOpenedByKeyboard) {
        this.isOpenedByKeyboard = false
        this.$nextTick(() => focusWhenShown(() => this.$refs.popover?.$refs.popover))
      }

      this.stopListeningPopoverEscape?.()
      this.stopListeningPopoverEscape = onEscape(() => {
        const popover = this.$refs.popover
        if (popover && popover.isOpen) {
          popover.hide()
          popover.$el.querySelector('button')?.focus()
        }
      })
    },
    onPopoverHide() {
      this.stopListeningPopoverEscape?.()
      this.stopListeningPopoverEscape = null
    }
  },
  beforeDestroy() {
    this.stopListeningPopoverEscape?.()
  }
}
