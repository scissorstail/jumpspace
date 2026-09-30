import { describe, expect, it } from 'vitest'
import { createNavigatorItem, emptyItemData, toProjectItems } from './navigator-items'

describe('createNavigatorItem', () => {
  it('adds the screen state and the index to an item', () => {
    const data = { nodes: {} }

    expect(createNavigatorItem({ name: 'a', data }, 7)).toEqual({
      name: 'a', data, index: 7, isMenuShown: false, isSelected: false, isEditing: false
    })
  })

  it('can start with the name box open, and keeps the view', () => {
    const item = createNavigatorItem({ name: '', data: {}, view: { k: 1, x: 2, y: 3 } }, 0, { isEditing: true })

    expect(item.isEditing).toBe(true)
    expect(item.view).toEqual({ k: 1, x: 2, y: 3 })
  })

  it('does not change the item it was given', () => {
    const item = { name: 'a', data: {} }

    createNavigatorItem(item, 1)

    expect(item).toEqual({ name: 'a', data: {} })
  })
})

describe('toProjectItems', () => {
  it('drops the screen state and keeps name, data and view', () => {
    const data = { nodes: {} }
    const view = { k: 0.5, x: 1, y: 2 }
    const items = [
      createNavigatorItem({ name: 'a', data, view }, 0, { isEditing: true }),
      createNavigatorItem({ name: 'b', data }, 1)
    ]

    expect(toProjectItems(items)).toEqual([{ name: 'a', data, view }, { name: 'b', data }])
  })

  it('leaves out an empty view instead of writing undefined', () => {
    const [item] = toProjectItems([{ name: 'a', data: {}, view: undefined, index: 1 }])

    expect(Object.hasOwn(item, 'view')).toBe(false)
  })
})

describe('emptyItemData', () => {
  it('returns a new empty diagram every time', () => {
    expect(emptyItemData()).toEqual({ id: 'test@0.1.0', nodes: {} })
    expect(emptyItemData()).not.toBe(emptyItemData())
  })
})
