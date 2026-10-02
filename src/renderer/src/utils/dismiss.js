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

// `show` prop과 `update:show` 이벤트를 쓰는 팝업(설정, 정보)을 대화상자처럼 다룬다. 열려 있는 동안
// - Esc로 닫고,
// - 열릴 때 포커스를 대화상자(ref="dialog")의 첫 컨트롤로 옮기고, Tab이 뒤에 깔린 화면으로 나가지 않게 가두고,
// - 닫히면 포커스를 열기 전 자리(닫힌 메뉴 안이었으면 그 메뉴 단추)로 돌려준다.
export const dismissOnEscape = {
  watch: {
    show(shown) {
      this.stopListeningEscape?.()
      this.stopListeningEscape = null
      if (shown) {
        this.returnFocusTo = document.activeElement ?? null
        this.stopListeningEscape = onDialogKeys({
          escape: () => this.$emit('update:show', false),
          focusables: () => focusablesIn(dialogElement(this))
        })
        // 대화상자(v-if)는 다음 렌더에서야 생긴다. 메뉴 항목으로 열었으면 b-dropdown이 닫히면서 포커스를
        // 메뉴 단추로 되돌리므로, 그다음 프레임에 옮긴다.
        this.$nextTick(() => nextFrame(() => focusWhenShown(() => focusablesIn(dialogElement(this))[0])))
      } else {
        returnFocusTarget(this.returnFocusTo)?.focus()
        this.returnFocusTo = null
      }
    }
  },
  beforeDestroy() {
    this.stopListeningEscape?.()
  }
}

function dialogElement(vm) {
  const dialog = vm.$refs?.dialog
  return dialog?.$el ?? dialog ?? null
}

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

function focusablesIn(root) {
  if (!root?.querySelectorAll) return []
  return [...root.querySelectorAll(FOCUSABLE)].filter(x => !x.disabled && x.offsetParent !== null)
}

// 대화상자의 키: Esc는 닫기, Tab은 trapTab으로 안에서 돈다. 리스너를 떼는 함수를 돌려준다.
function onDialogKeys({ escape, focusables }) {
  const listener = event => {
    if (event.key === 'Escape') {
      escape(event)
    } else if (event.key === 'Tab') {
      const target = trapTab(focusables(), document.activeElement, event.shiftKey)
      if (target) {
        event.preventDefault()
        target.focus()
      }
    }
  }
  document.addEventListener('keydown', listener)

  return () => document.removeEventListener('keydown', listener)
}

// Tab(shift면 Shift+Tab)이 대화상자 밖으로 나가려 하면 반대쪽 끝으로 돌린다.
// 포커스를 옮길 요소를 돌려주고, 브라우저에 맡겨도 되면 null이다. (포커스가 밖에 있으면 안으로 들인다)
export function trapTab(focusables, active, shift) {
  if (!focusables.length) return null

  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (!focusables.includes(active)) return shift ? last : first
  if (shift && active === first) return last
  if (!shift && active === last) return first
  return null
}

// 대화상자를 닫은 뒤 포커스를 돌려줄 요소. 그 요소가 사라졌으면 없고, 닫힌 드롭다운 메뉴 안에 있으면 그 메뉴 단추다.
export function returnFocusTarget(element) {
  if (!element?.isConnected) return null
  if (element.offsetParent !== null) return element

  const toggle = element.closest?.('.dropdown')?.querySelector('.dropdown-toggle')
  return toggle && toggle.offsetParent !== null ? toggle : null
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
