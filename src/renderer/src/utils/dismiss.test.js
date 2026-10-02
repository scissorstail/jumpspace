import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closePopoverOnEscape, dismissOnEscape, focusWhenShown, isKeyboardClick, onEscape, returnFocusTarget, trapTab } from './dismiss'

// 테스트는 DOM 없이 돌기 때문에 document 대신 리스너 목록만 흉내 낸다.
let listeners
const press = key => [...listeners].forEach(listener => listener({ key }))

beforeEach(() => {
  listeners = new Set()
  vi.stubGlobal('document', {
    addEventListener: (type, listener) => type === 'keydown' && listeners.add(listener),
    removeEventListener: (type, listener) => type === 'keydown' && listeners.delete(listener)
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('onEscape', () => {
  it('calls the handler for Escape only', () => {
    const handler = vi.fn()
    onEscape(handler)

    press('a')
    press('Enter')
    expect(handler).not.toHaveBeenCalled()

    press('Escape')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('stops listening once the returned function is called', () => {
    const handler = vi.fn()
    const stop = onEscape(handler)

    stop()
    press('Escape')

    expect(handler).not.toHaveBeenCalled()
    expect(listeners.size).toBe(0)
  })
})

describe('dismissOnEscape', () => {
  // Vue 없이 mixin의 watcher와 훅을 직접 호출한다.
  const create = () => {
    const vm = { $emit: vi.fn(), $nextTick: callback => callback() }
    return { vm, show: shown => dismissOnEscape.watch.show.call(vm, shown), destroy: () => dismissOnEscape.beforeDestroy.call(vm) }
  }

  it('closes an open popup on Escape', () => {
    const { vm, show } = create()

    show(true)
    press('Escape')

    expect(vm.$emit).toHaveBeenCalledWith('update:show', false)
  })

  it('ignores Escape while the popup is closed, and after it was closed', () => {
    const { vm, show } = create()

    press('Escape')
    show(true)
    show(false)
    press('Escape')

    expect(vm.$emit).not.toHaveBeenCalled()
    expect(listeners.size).toBe(0)
  })

  it('does not stack listeners when opened again, and cleans up on destroy', () => {
    const { vm, show, destroy } = create()

    show(true)
    show(true)
    expect(listeners.size).toBe(1)

    press('Escape')
    expect(vm.$emit).toHaveBeenCalledTimes(1)

    destroy()
    expect(listeners.size).toBe(0)
  })
})

describe('closePopoverOnEscape', () => {
  const create = (isOpen = true) => {
    const button = { focus: vi.fn() }
    const popover = { isOpen, hide: vi.fn(), $el: { querySelector: () => button } }
    const vm = { $refs: { popover } }
    const { onPopoverShow, onPopoverHide } = closePopoverOnEscape.methods
    return { popover, button, show: () => onPopoverShow.call(vm), hide: () => onPopoverHide.call(vm), destroy: () => closePopoverOnEscape.beforeDestroy.call(vm) }
  }

  it('closes the open popover on Escape and gives the focus back to its button', () => {
    const { popover, button, show } = create()

    show()
    press('Escape')

    expect(popover.hide).toHaveBeenCalledTimes(1)
    expect(button.focus).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the popover is already closed, or after it was hidden', () => {
    const closed = create(false)
    closed.show()
    press('Escape')
    expect(closed.popover.hide).not.toHaveBeenCalled()

    const { popover, show, hide } = create()
    show()
    hide()
    press('Escape')
    expect(popover.hide).not.toHaveBeenCalled()
    expect(listeners.size).toBe(1) // 첫 번째 popover(closed)의 리스너만 남는다
  })

  it('does not stack listeners and cleans up on destroy', () => {
    const { show, destroy } = create()

    show()
    show()
    expect(listeners.size).toBe(1)

    destroy()
    expect(listeners.size).toBe(0)
  })
})

describe('isKeyboardClick', () => {
  it('tells a click made with Enter/Space (detail 0) from a mouse click', () => {
    expect(isKeyboardClick({ detail: 0 })).toBe(true)
    expect(isKeyboardClick({ detail: 1 })).toBe(false)
    expect(isKeyboardClick({ detail: 2 })).toBe(false)
  })
})

describe('closePopoverOnEscape: focus when opened by keyboard', () => {
  const create = () => {
    const doc = {}
    const inner = { ownerDocument: doc, focus: vi.fn(function () { doc.activeElement = this }) }
    const vm = { $refs: { popover: { isOpen: true, hide: vi.fn(), $el: { querySelector: () => null }, $refs: { popover: inner } } }, $nextTick: fn => fn() }
    const { onTriggerClick, onPopoverShow } = closePopoverOnEscape.methods
    return { inner, click: event => onTriggerClick.call(vm, event), show: () => onPopoverShow.call(vm), created: () => closePopoverOnEscape.created.call(vm) }
  }

  it('moves the focus into the popover after a keyboard click, once', () => {
    const { inner, click, show, created } = create()
    created()

    click({ detail: 0 })
    show()
    expect(inner.focus).toHaveBeenCalledTimes(1)

    show() // 다음에 마우스 없이 다시 열려도 새 클릭 없이는 옮기지 않는다
    expect(inner.focus).toHaveBeenCalledTimes(1)
  })

  it('leaves the focus alone after a mouse click', () => {
    const { inner, click, show, created } = create()
    created()

    click({ detail: 1 })
    show()

    expect(inner.focus).not.toHaveBeenCalled()
  })
})

describe('focusWhenShown', () => {
  // 처음 hiddenFrames번은 숨겨져 있어서 focus()가 무시되는 요소
  const element = hiddenFrames => {
    const doc = { activeElement: null }
    let calls = 0
    return { ownerDocument: doc, focus: vi.fn(function () { if (++calls > hiddenFrames) doc.activeElement = this }) }
  }
  const frames = () => {
    const queue = []
    return { schedule: callback => queue.push(callback), run: () => { while (queue.length) queue.shift()() }, queue }
  }

  it('focuses right away when the element is visible', () => {
    const el = element(0)
    const { schedule, queue } = frames()
    focusWhenShown(() => el, { schedule })
    expect(el.ownerDocument.activeElement).toBe(el)
    expect(queue).toHaveLength(0)
  })

  it('tries again on the next frames until the element takes the focus', () => {
    const el = element(2)
    const { schedule, run } = frames()
    focusWhenShown(() => el, { schedule })
    expect(el.ownerDocument.activeElement).toBe(null)
    run()
    expect(el.ownerDocument.activeElement).toBe(el)
    expect(el.focus).toHaveBeenCalledTimes(3)
  })

  it('gives up after the given number of tries, and when the element is gone', () => {
    const el = element(100)
    const { schedule, run } = frames()
    focusWhenShown(() => el, { schedule, tries: 5 })
    run()
    expect(el.focus).toHaveBeenCalledTimes(5)

    const getElement = vi.fn(() => null)
    focusWhenShown(getElement, { schedule })
    expect(getElement).toHaveBeenCalledTimes(1)
  })
})

describe('trapTab', () => {
  const [a, b, c] = ['a', 'b', 'c']

  it('wraps Tab from the last control to the first and Shift+Tab from the first to the last', () => {
    expect(trapTab([a, b, c], c, false)).toBe(a)
    expect(trapTab([a, b, c], a, true)).toBe(c)
  })

  it('leaves Tab inside the dialog to the browser', () => {
    expect(trapTab([a, b, c], a, false)).toBeNull()
    expect(trapTab([a, b, c], b, true)).toBeNull()
  })

  it('pulls a focus that is outside back in, and does nothing without controls', () => {
    expect(trapTab([a, b, c], 'outside', false)).toBe(a)
    expect(trapTab([a, b, c], 'outside', true)).toBe(c)
    expect(trapTab([], a, false)).toBeNull()
  })
})

// 화면에 보이는지(offsetParent)와 문서에 붙어 있는지(isConnected)만 흉내 낸 요소
const element = ({ visible = true, connected = true, dropdown = null, name = '' } = {}) => ({
  name,
  isConnected: connected,
  offsetParent: visible ? {} : null,
  disabled: false,
  focus: vi.fn(),
  closest: selector => (selector === '.dropdown' ? dropdown : null)
})

describe('returnFocusTarget', () => {
  it('returns the element that had the focus while it is still shown', () => {
    const button = element()
    expect(returnFocusTarget(button)).toBe(button)
  })

  it('falls back to the toggle of the closed menu the element was in', () => {
    const toggle = element()
    const item = element({ visible: false, dropdown: { querySelector: () => toggle } })
    expect(returnFocusTarget(item)).toBe(toggle)
  })

  it('gives nothing for an element that is gone or hidden without a menu', () => {
    expect(returnFocusTarget(element({ connected: false }))).toBeNull()
    expect(returnFocusTarget(element({ visible: false }))).toBeNull()
    expect(returnFocusTarget(null)).toBeNull()
  })
})

describe('dismissOnEscape: focus like a dialog', () => {
  let focused
  const opener = element({ name: 'opener' })
  const controls = [element({ name: 'first' }), element({ name: 'middle' }), element({ name: 'last' })]

  beforeEach(() => {
    focused = opener
    for (const x of [opener, ...controls]) x.focus.mockImplementation(function () { focused = this })
    vi.stubGlobal('document', {
      get activeElement() { return focused },
      addEventListener: (type, listener) => type === 'keydown' && listeners.add(listener),
      removeEventListener: (type, listener) => type === 'keydown' && listeners.delete(listener)
    })
    vi.stubGlobal('requestAnimationFrame', callback => callback())
  })

  const create = () => {
    // 대화상자는 다음 렌더($nextTick)에서야 생긴다.
    const vm = { $emit: vi.fn(), $refs: {}, $nextTick: callback => { vm.$refs.dialog = { $el: { querySelectorAll: () => controls } }; callback() } }
    return { vm, show: shown => dismissOnEscape.watch.show.call(vm, shown) }
  }
  const tab = (shiftKey = false) => {
    const event = { key: 'Tab', shiftKey, preventDefault: vi.fn() }
    ;[...listeners].forEach(listener => listener(event))
    return event
  }

  it('moves the focus to the first control when it opens', () => {
    create().show(true)
    expect(focused.name).toBe('first')
  })

  it('keeps Tab and Shift+Tab inside the dialog', () => {
    create().show(true)

    expect(tab(true).preventDefault).toHaveBeenCalled()
    expect(focused.name).toBe('last')
    expect(tab().preventDefault).toHaveBeenCalled()
    expect(focused.name).toBe('first')

    expect(tab().preventDefault).not.toHaveBeenCalled() // first -> middle는 브라우저가 한다
  })

  it('gives the focus back when it closes, and stops trapping', () => {
    const { show } = create()
    show(true)
    show(false)

    expect(focused.name).toBe('opener')
    expect(listeners.size).toBe(0)
  })
})
