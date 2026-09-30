import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closePopoverOnEscape, dismissOnEscape, onEscape } from './dismiss'

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
    const vm = { $emit: vi.fn() }
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
