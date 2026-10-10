import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { copyNavigatorItem, createNavigatorItem, emptyItemData, removeNavigatorItems, toProjectItems, SWITCHER_MENU_POPPER } from './navigator-items'

// 판(#diagram-switcher)과 목록은 넘치는 것을 자른다. 그 안의 메뉴가 판보다 길면(항목이 적을 때) 아래가 잘려 보이지 않았다.
describe('menus in the diagram list', () => {
  it('are placed with position: fixed', () => {
    expect(SWITCHER_MENU_POPPER.positionFixed).toBe(true)
  })

  it.each(['main-navigator.vue', 'navigator-item-menu.vue'])('every dropdown in %s leaves the panel', (file) => {
    const source = readFileSync(join(__dirname, '..', 'components', 'layout', file), 'utf8')
    const dropdowns = source.match(/<b-dropdown\s[^>]*>/g) || []

    expect(dropdowns.length).toBeGreaterThan(0)
    for (const tag of dropdowns) {
      expect(tag).toContain(':popper-opts="menuPopperOpts"')
      expect(tag).toContain('boundary="window"')
    }
    expect(source).toContain('this.menuPopperOpts = SWITCHER_MENU_POPPER')
  })
})

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

describe('copyNavigatorItem', () => {
  const original = () => createNavigatorItem({
    name: 'prod',
    data: { id: 'test@0.1.0', nodes: { 1: { data: { connection: { host: 'a', forwards: [{ from: '8080' }] } } } } },
    view: { k: 1, x: 2, y: 3 }
  }, 4)

  it('copies name, diagram and view into a new item with its name box open', () => {
    const item = original()
    const copy = copyNavigatorItem(item, 9)

    expect(copy).toMatchObject({ name: 'prod', index: 9, isEditing: true, isSelected: false, isMenuShown: false })
    expect(copy.data).toEqual(item.data)
    expect(copy.view).toEqual(item.view)
  })

  it('changing the copy leaves the original alone', () => {
    const item = original()
    const copy = copyNavigatorItem(item, 9)

    copy.data.nodes[1].data.connection.host = 'b'
    copy.data.nodes[1].data.connection.forwards.push({ from: '9090' })
    copy.view.k = 2

    expect(item.data.nodes[1].data.connection).toEqual({ host: 'a', forwards: [{ from: '8080' }] })
    expect(item.view).toEqual({ k: 1, x: 2, y: 3 })
  })

  it('does not invent a view for an item without one', () => {
    const copy = copyNavigatorItem(createNavigatorItem({ name: 'a', data: emptyItemData() }, 1), 2)

    expect(toProjectItems([copy])[0]).not.toHaveProperty('view')
  })
})

describe('removeNavigatorItems', () => {
  const [a, b, c] = ['a', 'b', 'c'].map((name, i) => createNavigatorItem({ name, data: {} }, i))

  it('keeps the order of the remaining items and does not change the list it was given', () => {
    const items = [a, b, c]

    expect(removeNavigatorItems(items, [b], null).items).toEqual([a, c])
    expect(removeNavigatorItems(items, [c, a], null).items).toEqual([b])
    expect(items).toEqual([a, b, c])
  })

  it('says whether the open item was removed', () => {
    expect(removeNavigatorItems([a, b, c], [b], b).openedRemoved).toBe(true)
    expect(removeNavigatorItems([a, b, c], [a, c], b).openedRemoved).toBe(false)
    expect(removeNavigatorItems([a, b, c], [b], null).openedRemoved).toBe(false)
  })

  it('compares items, not names', () => {
    const twin = createNavigatorItem({ name: 'b', data: {} }, 7)

    expect(removeNavigatorItems([a, b, twin], [twin], b)).toEqual({ items: [a, b], openedRemoved: false })
  })
})
