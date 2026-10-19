import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import Vue from 'vue'
import { copyNavigatorItem, createNavigatorItem, emptyItemData, nextOpened, recentItems, removeNavigatorItems, rowAfterRemoval, toProjectItems, RECENT_SPACES, SWITCHER_MENU_POPPER } from './navigator-items'

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
      name: 'a', data, index: 7, opened: 0, isMenuShown: false, isSelected: false, isEditing: false
    })
    expect(createNavigatorItem({ name: 'a', data, opened: 3 }, 7).opened).toBe(3)
  })

  // 연 차례가 처음부터 있어서(0), 처음 열 때 그것을 주어도 목록이 바뀐 것이 아니다 (#255). 새로 붙이면 Vue는 목록(items)의
  // watch에 알리고, 그 watch가 한 번 더 저장했다 (열 때마다 두 번).
  it('starts with the order of opening, so that giving it one is no change of the list', async () => {
    const changes = []
    const vm = new Vue({ data: { items: [createNavigatorItem({ name: 'a', data: {} }, 0), { name: 'b', data: {} }] }, watch: { items() { changes.push('items') } } })

    vm.$set(vm.items[0], 'opened', 1)
    await vm.$nextTick()
    expect(changes).toEqual([])

    // 그것이 없는 항목이라면
    vm.$set(vm.items[1], 'opened', 2)
    await vm.$nextTick()
    expect(changes).toEqual(['items'])
    vm.$destroy()
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

  // 연 차례는 저장해서 다음에 켤 때도 Recent가 같다 (#255). 한 번도 열지 않은 항목에는 쓰지 않는다.
  it('keeps the order of opening, and writes none for an item never opened', () => {
    const data = {}
    const [opened, never] = toProjectItems([createNavigatorItem({ name: 'a', data, opened: 4 }, 0), createNavigatorItem({ name: 'b', data }, 1)])

    expect(opened).toEqual({ name: 'a', data, opened: 4 })
    expect(Object.hasOwn(never, 'opened')).toBe(false)
  })
})

describe('recentItems', () => {
  const list = openings => openings.map((opened, i) => createNavigatorItem({ name: `s${i}`, data: {}, ...(opened && { opened }) }, i))
  const names = items => items.map(x => x.name)

  it('gives the diagrams opened last, the last one first', () => {
    const items = list([2, 5, 0, 1, 4])

    expect(names(recentItems(items, null))).toEqual(['s1', 's4', 's0'])
    expect(RECENT_SPACES).toBe(3)
  })

  it('leaves out the open diagram and those never opened', () => {
    const items = list([2, 5, 0, 1, 4])

    expect(names(recentItems(items, items[1]))).toEqual(['s4', 's0', 's3'])
    expect(names(recentItems(list([0, 0, 3]), null))).toEqual(['s2'])
    expect(recentItems(list([0, 0]), null)).toEqual([])
  })

  it('keeps the list as it is, and takes the order of the list for the same number', () => {
    const items = list([1, 3, 3])

    expect(names(recentItems(items, null, 2))).toEqual(['s1', 's2'])
    expect(names(items)).toEqual(['s0', 's1', 's2'])
  })
})

describe('nextOpened', () => {
  it('is the number after the last opening, 1 for a list never opened', () => {
    expect(nextOpened([{ opened: 2 }, {}, { opened: 7 }])).toBe(8)
    expect(nextOpened([{}, {}])).toBe(1)
    expect(nextOpened([])).toBe(1)
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

  // 사본은 새 다이어그램이다: 아직 연 적이 없다
  it('does not take the order of opening of the original', () => {
    const copy = copyNavigatorItem(createNavigatorItem({ name: 'a', data: emptyItemData(), opened: 6 }, 1), 2)

    expect(copy.opened).toBe(0)
    expect(toProjectItems([copy])[0]).not.toHaveProperty('opened')
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

describe('rowAfterRemoval', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((name, i) => createNavigatorItem({ name, data: {} }, i))

  it('is the row that takes the place of the removed one, else the one before it', () => {
    expect(rowAfterRemoval([a, b, c], b)).toBe(c)
    expect(rowAfterRemoval([a, b, c], a)).toBe(b)
    expect(rowAfterRemoval([a, b, c], c)).toBe(b)
    expect(rowAfterRemoval([a], a)).toBeNull()
  })

  // 검색에 맞지 않는 줄은 숨어 있다 (v-show): 그 줄은 건너뛴다
  it('skips the rows that are not shown, and is null when no row shown is left', () => {
    const shown = new Set([a, d])
    const isShown = x => shown.has(x)

    expect(rowAfterRemoval([a, b, c, d], a, isShown)).toBe(d)
    expect(rowAfterRemoval([a, b, c, d], d, isShown)).toBe(a)
    expect(rowAfterRemoval([a, b, c], a, isShown)).toBeNull()
  })

  it('is null for an item that is not in the list', () => {
    expect(rowAfterRemoval([a, b], c)).toBeNull()
  })
})
